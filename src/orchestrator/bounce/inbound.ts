import type { Message, Space } from "@spectrum-ts/core";

import { runInteractionAgent } from "../agents/index";
import { registerSpace } from "../handoff/index";
import type { OrchestratorTurn } from "../types/index";
import { createKeyedDebounce, deliverReplies } from "../utils/index";

export type { OrchestratorTurn };

const DEFAULT_DEBOUNCE_MS = 1_500;

export const getOrchestratorDebounceMs = () => {
  const raw = process.env.ORCHESTRATOR_DEBOUNCE_MS?.trim();

  if (!raw) return DEFAULT_DEBOUNCE_MS;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DEBOUNCE_MS;
};

const getDebounceKey = (space: Space, senderKey?: string) => {
  return senderKey?.trim() || space.id;
};

export const buildDebouncedTurn = (
  existing: OrchestratorTurn | undefined,
  input: { text: string; space: Space; message: Message; senderKey?: string },
): OrchestratorTurn => {
  return {
    texts: [...(existing?.texts ?? []), input.text],
    space: input.space,
    message: input.message,
    senderKey: input.senderKey,
  };
};

const pendingTurns = new Map<string, OrchestratorTurn>();

const flushOrchestratorTurn = async (key: string, turn: OrchestratorTurn) => {
  pendingTurns.delete(key);

  const inboundText = turn.texts.join("\n").trim();
  if (!inboundText) return;

  const spaceId = turn.space.id;
  registerSpace(spaceId, turn.space);

  console.log(`[bounce] Flush space ${spaceId}:`, inboundText.slice(0, 120));

  try {
    await turn.message.read();
  } catch (error) {
    console.warn("[bounce] Failed to mark message read", error);
  }

  await turn.space.responding(async () => {
    const { replies } = await runInteractionAgent(spaceId, {
      kind: "user_message",
      text: inboundText,
    });

    if (replies.length === 0) {
      console.log(
        "[bounce] Orchestrator produced no immediate reply (may be waiting on sub-agent)",
      );
      return;
    }

    await deliverReplies(turn.space, replies);
  });
};

const debounce = createKeyedDebounce<OrchestratorTurn>({
  delayMs: getOrchestratorDebounceMs,
  onFlush: flushOrchestratorTurn,
});

export const scheduleOrchestratorTurn = (input: {
  space: Space;
  message: Message;
  text: string;
  senderKey?: string;
}): void => {
  const key = getDebounceKey(input.space, input.senderKey);
  registerSpace(input.space.id, input.space);

  const next = buildDebouncedTurn(pendingTurns.get(key), input);
  pendingTurns.set(key, next);
  debounce.schedule(key, next);
};
