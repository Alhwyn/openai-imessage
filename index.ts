import { Spectrum, type Message, type Space } from "@spectrum-ts/core";
import { imessage } from "@spectrum-ts/imessage";

import {
  assertConvexEnv,
  assertGmiApiKey,
  extractInboundText,
  scheduleOrchestratorTurn,
} from "./src/orchestrator/index";

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

const handleInbound = (space: Space, message: Message): void => {
  if (message.direction === "outbound") {
    return;
  }

  const sender = message.sender;
  if (sender && typeof sender === "object" && "kind" in sender && sender.kind === "agent") {
    return;
  }

  const inboundText = extractInboundText(message);
  if (!inboundText) {
    console.log("[app] Ignored message without text");
    return;
  }

  console.log("[app] Inbound:", inboundText.slice(0, 80));

  scheduleOrchestratorTurn({
    space,
    message,
    text: inboundText,
    senderKey: senderKeyFrom(space, message),
  });
};

const main = async () => {
  assertGmiApiKey();
  assertConvexEnv();

  const { projectId, projectSecret, webhookSecret, missing } = getSpectrumEnv();
  if (missing.length > 0) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }

  const port = Number.parseInt(process.env.AGENT_PORT?.trim() || "4001", 10);

  const app = await Spectrum({
    projectId: projectId!,
    projectSecret: projectSecret!,
    platforms: [imessage.config()],
    webhookSecret,
  });

  console.log(
    `[app] Orchestrator listening (Spectrum + GMI). Debounced inbound → assign_task → notify → space.send`,
  );
  console.log(`[app] AGENT_PORT hint: ${port} (set BASE_URL when using the tunnel)`);

  for await (const [space, message] of app.messages) {
    try {
      handleInbound(space, message);
    } catch (error) {
      console.error("[app] Failed to handle inbound message", error);
    }
  }
};

main().catch((error) => {
  console.error("[app] Fatal:", error);
  process.exit(1);
});
