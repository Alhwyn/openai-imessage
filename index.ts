import { Spectrum, type Message, type Space, type SpectrumInstance } from "@spectrum-ts/core";
import { imessage } from "@spectrum-ts/imessage";

import {
  assertConvexEnv,
  assertGmiApiKey,
  createRecentIdTracker,
  extractInboundImages,
  extractInboundText,
  scheduleOrchestratorTurn,
} from "./src/orchestrator/index";

/** Drop provider redeliveries for a few minutes inside one process. */
const SEEN_MESSAGE_TTL_MS = 10 * 60_000;
const SEEN_MESSAGE_MAX = 2_000;

const seenInboundMessages = createRecentIdTracker({
  ttlMs: SEEN_MESSAGE_TTL_MS,
  maxSize: SEEN_MESSAGE_MAX,
});

const readEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
};

const getSpectrumEnv = () => {
  const projectId = readEnv("SPECTRUM_PROJECT_ID", "PROJECT_ID");
  const projectSecret = readEnv("SPECTRUM_PROJECT_SECRET", "PROJECT_SECRET");
  const webhookSecret = readEnv(
    "SPECTRUM_SIGNING_WEBHOOK",
    "SPECTRUM_WEBHOOK_SECRET",
    "SPECTRUM_SIGNING_SECRET",
  );

  const missing: string[] = [];
  if (!projectId) missing.push("SPECTRUM_PROJECT_ID");
  if (!projectSecret) missing.push("SPECTRUM_PROJECT_SECRET");

  return { projectId, projectSecret, webhookSecret, missing };
};

const senderKeyFrom = (space: Space, message: Message): string | undefined => {
  const sender = message.sender;
  if (sender && typeof sender === "object" && "id" in sender && typeof sender.id === "string") {
    return sender.id;
  }
  return space.id;
};

const handleInbound = async (space: Space, message: Message): Promise<void> => {
  if (message.direction === "outbound") {
    return;
  }

  const sender = message.sender;
  if (sender && typeof sender === "object" && "kind" in sender && sender.kind === "agent") {
    return;
  }

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

  const senderKey = senderKeyFrom(space, message);
  console.log("[app] Inbound:", inboundText.slice(0, 80), {
    messageId: message.id,
    spaceId: space.id,
    senderKey,
    images: inboundImages.map((image) => image.filename),
  });

  scheduleOrchestratorTurn({
    space,
    message,
    text: inboundText,
    images: inboundImages,
    senderKey,
  });
};

const main = async () => {
  assertGmiApiKey();
  assertConvexEnv();

  const { projectId, projectSecret, webhookSecret, missing } = getSpectrumEnv();
  if (missing.length > 0) throw new Error(`Missing env: ${missing.join(", ")}`);

  const app: SpectrumInstance = await Spectrum({
    projectId: projectId!,
    projectSecret: projectSecret!,
    platforms: [imessage.config()],
    webhookSecret,
  });

  let stopping = false;
  const stopApp = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[app] Stopping Spectrum (${reason})`);
    try {
      await app.stop();
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
    `[app] Orchestrator listening (Spectrum + GMI). Debounced inbound → assign_task → notify → reply/react`,
  );

  try {
    for await (const [space, message] of app.messages) {
      try {
        await handleInbound(space, message);
      } catch (error) {
        console.error("[app] Failed to handle inbound message", error);
      }
    }
  } finally {
    await stopApp("messages ended");
  }
};

main().catch((error) => {
  console.error("[app] Fatal:", error);
  process.exit(1);
});
