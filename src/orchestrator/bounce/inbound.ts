import { runInteractionAgent } from "../agents/index";
import { summarizeOutbound } from "../outbound";
import {
  createKeyedDebounce,
  DEFAULT_ORCHESTRATOR_DEBOUNCE_MS,
  deliverOutbound,
  getOpenAiErrorDetails,
} from "../utils/index";

import { turnFailureOutbound } from "./failurePolicy";

import type {
  BuildDebouncedTurnInput,
  OrchestratorTurn,
  ScheduleOrchestratorTurnInput,
} from "./types";
import type { OutboundItem } from "../contracts";

/**
 * Builds a debounced turn.
 */
export const buildDebouncedTurn = (
  existing: OrchestratorTurn | undefined,
  input: BuildDebouncedTurnInput,
): OrchestratorTurn => {
  return {
    images: [...(existing?.images ?? []), ...(input.images ?? [])],
    texts: [...(existing?.texts ?? []), input.text],
    space: input.space,
    message: input.message,
    senderId: input.senderId,
  };
};

const pendingTurns = new Map<string, OrchestratorTurn>();

/**
 * Flushes an orchestrator turn.
 */
const flushOrchestratorTurn = async (key: string, turn: OrchestratorTurn) => {
  pendingTurns.delete(key);

  const inboundText = turn.texts.join("\n").trim();
  if (!inboundText && turn.images.length === 0) return;

  const spaceId = turn.space.id;

  console.log(`[bounce] Flush space ${spaceId}:`, inboundText.slice(0, 120));

  try {
    await turn.message.read();
  } catch (error) {
    console.warn("[bounce] Failed to mark message read", error);
  }

  console.log(`[bounce] Starting interaction for space ${spaceId}`);

  let outbound: OutboundItem[];
  try {
    ({ outbound } = await runInteractionAgent(
      spaceId,
      {
        senderId: turn.senderId,
        text: inboundText,
        images: turn.images,
      },
      {
        space: turn.space,
        message: turn.message,
      },
    ));
  } catch (error) {
    await handleTurnFailure(turn, error);
    return;
  }

  if (outbound.length === 0) {
    console.log(
      "[bounce] Turn complete (tools already sent, or waiting on sub-agent)",
    );
    return;
  }

  console.log(`[bounce] Delivering ${outbound.length} queued outbound item(s) for space ${spaceId}`, {
    items: summarizeOutbound(outbound),
  });
  await deliverOutbound(turn.space, outbound, { targetMessage: turn.message });
  console.log(`[bounce] Completed turn for space ${spaceId}`);
};

const handleTurnFailure = async (
  turn: OrchestratorTurn,
  error: unknown,
): Promise<void> => {
  console.error(
    `[bounce] Turn failed for space ${turn.space.id}`,
    getOpenAiErrorDetails(error),
  );
  await deliverOutbound(turn.space, turnFailureOutbound(), {
    targetMessage: turn.message,
  });
};

/** Debounces pending turns and flushes the latest value for each key. */
const debounce = createKeyedDebounce<OrchestratorTurn>({
  delayMs: DEFAULT_ORCHESTRATOR_DEBOUNCE_MS,
  onFlush: flushOrchestratorTurn,
  onError: async (_key, turn, error) => {
    await handleTurnFailure(turn, error);
  },
});

/** Flushes all accepted inbound turns before shutdown. */
export const flushPendingOrchestratorTurns = async (): Promise<void> => {
  await debounce.flushAll();
};

/**
 * Schedules an orchestrator turn.
 */
export const scheduleOrchestratorTurn = (
  input: ScheduleOrchestratorTurnInput,
): void => {
  const key = input.senderId?.trim() || input.space.id;

  const next = buildDebouncedTurn(pendingTurns.get(key), input);
  pendingTurns.set(key, next);
  debounce.schedule(key, next);
};
