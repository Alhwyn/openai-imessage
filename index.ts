import { Spectrum, type Message, type Space, type SpectrumInstance } from "@spectrum-ts/core";
import { imessage } from "@spectrum-ts/imessage";

import {
  COMPUTER_WATCHDOG_INTERVAL_MS,
  COMPUTER_WORKER_TIMEOUT_MS,
} from "./src/orchestrator/computer/constants";
import { startComputerViewer } from "./src/orchestrator/computer/viewer";
import {
  assertConvexEnv,
  assertOpenAiApiKey,
  createRecentIdTracker,
  extractInboundImages,
  extractInboundText,
  flushPendingOrchestratorTurns,
  reconcileStaleComputerRuns,
  scheduleOrchestratorTurn,
  SEEN_MESSAGE_MAX,
  SEEN_MESSAGE_TTL_MS,
} from "./src/orchestrator/index";
import { registerSpectrumApp, startMapsViewer } from "./src/orchestrator/maps";

/** Drop provider redeliveries for a few minutes inside one process. */
const seenInboundMessages = createRecentIdTracker({
  ttlMs: SEEN_MESSAGE_TTL_MS,
  maxSize: SEEN_MESSAGE_MAX,
});

const getSpectrumEnv = () => {
  const projectId = process.env.SPECTRUM_PROJECT_ID?.trim();
  const projectSecret = process.env.SPECTRUM_PROJECT_SECRET?.trim();
  const webhookSecret = process.env.SPECTRUM_SIGNING_WEBHOOK?.trim();

  const missing: string[] = [];
  if (!projectId) missing.push("SPECTRUM_PROJECT_ID");
  if (!projectSecret) missing.push("SPECTRUM_PROJECT_SECRET");

  return { projectId, projectSecret, webhookSecret, missing };
};

const senderIdFrom = (message: Message): string | null => {
  const sender = message.sender;
  if (sender && typeof sender === "object" && "id" in sender && typeof sender.id === "string") return sender.id;

  return null;
};

const handleInbound = async (space: Space, message: Message): Promise<void> => {
  if (message.direction === "outbound") return;

  const sender = message.sender;
  if (sender && typeof sender === "object" && "kind" in sender && sender.kind === "agent") return;

  if (!seenInboundMessages.claim(message.id)) {
    console.log("[app] Skipping duplicate inbound message", {
      messageId: message.id,
      spaceId: space.id,
    });
    return;
  }

  const inboundText = extractInboundText(message);
  const inboundImages = await extractInboundImages(message);
  if (!inboundText && inboundImages.length === 0) {
    console.log("[app] Ignored unsupported message content", {
      messageId: message.id,
      spaceId: space.id,
    });
    return;
  }

  const senderId = senderIdFrom(message);
  console.log("[app] Inbound:", inboundText.slice(0, 80), {
    messageId: message.id,
    spaceId: space.id,
    senderId,
    images: inboundImages.map((image) => image.filename),
  });

  scheduleOrchestratorTurn({
    space,
    message,
    text: inboundText,
    images: inboundImages,
    senderId,
  });
};

const main = async () => {
  assertOpenAiApiKey();
  assertConvexEnv();
  const reconciled = await reconcileStaleComputerRuns({
    staleBefore: Date.now(),
    error: "Computer worker stopped when the orchestrator restarted",
  });
  if (reconciled > 0) console.warn(`[computer-agent] Reconciled ${reconciled} orphaned run(s)`);

  const watchdog = setInterval(() => {
    void reconcileStaleComputerRuns({
      staleBefore:
        Date.now() -
        COMPUTER_WORKER_TIMEOUT_MS -
        COMPUTER_WATCHDOG_INTERVAL_MS,
      error: "Computer worker stopped reporting progress",
    }).catch((error: unknown) => {
      console.error("[computer-agent] Watchdog reconciliation failed", error);
    });
  }, COMPUTER_WATCHDOG_INTERVAL_MS);
  watchdog.unref();

  const computerViewer = startComputerViewer();
  const mapsViewer = startMapsViewer();

  const { projectId, projectSecret, webhookSecret, missing } = getSpectrumEnv();
  if (missing.length > 0) throw new Error(`Missing env: ${missing.join(", ")}`);

  const app: SpectrumInstance = await Spectrum({
    projectId: projectId!,
    projectSecret: projectSecret!,
    platforms: [imessage.config()],
    webhookSecret,
  });
  registerSpectrumApp(app);
  let stopping = false;
  const inboundJobs = new Set<Promise<void>>();
  const stopApp = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    clearInterval(watchdog);
    console.log(`[app] Stopping Spectrum (${reason})`);
    try {
      await Promise.allSettled(inboundJobs);
      await flushPendingOrchestratorTurns();
      await app.stop();
      await computerViewer.stop(true);
      await mapsViewer.stop(true);
    } catch (error) {
      console.error("[app] Spectrum stop failed", error);
    }
  };

  const shutdownAndExit = (reason: string, exitCode = 0) => {
    void stopApp(reason).finally(() => {
      process.exit(exitCode);
    });
  };

  const onSignal = (signal: NodeJS.Signals) => {
    shutdownAndExit(signal, 0);
  };

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  process.once("beforeExit", (code) => {
    shutdownAndExit("beforeExit", code);
  });

  console.log(
    `[app] Orchestrator listening (Spectrum + OpenAI). Debounced inbound → assign_task → notify → reply/react`,
  );

  try {
    for await (const [space, message] of app.messages) {
      const job = handleInbound(space, message).catch((error: unknown) => {
        console.error("[app] Failed to handle inbound message", error);
      });
      inboundJobs.add(job);
      void job.finally(() => {
        inboundJobs.delete(job);
      });
    }
  } finally {
    await stopApp("messages ended");
  }
};

main().catch((error) => {
  console.error("[app] Fatal:", error);
  process.exit(1);
});
