
import {
  getTapbackOnlyRequest,
  runInteractionAgent,
} from "../agents/index";
import { registerSpace } from "../handoff/index";
import {
  createKeyedDebounce,
  deliverOutbound,
  getGmiErrorDetails,
} from "../utils/index";

import type {
  BuildDebouncedTurnInput,
  OrchestratorTurn,
  ScheduleOrchestratorTurnInput,
} from "./types";
import type { OutboundItem } from "../agents/types";

const DEFAULT_DEBOUNCE_MS = 1_500;

export const getOrchestratorDebounceMs = () => {
  const raw = process.env.ORCHESTRATOR_DEBOUNCE_MS?.trim();

  if (!raw) return DEFAULT_DEBOUNCE_MS;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DEBOUNCE_MS;
};

/**
 * Builds a debounced turn.
 * @param existing - The existing orchestrator turn.
 * @param input - The input to build a debounced turn.
 * @returns A turn containing the accumulated inbound texts and latest message.
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
    senderKey: input.senderKey,
  };
};

const pendingTurns = new Map<string, OrchestratorTurn>();

/**
 * Flushes an orchestrator turn.
 * @param key - The key of the orchestrator turn.
 * @param turn - The orchestrator turn to flush.
 * @returns Nothing after the turn has been processed.
 */
const flushOrchestratorTurn = async (key: string, turn: OrchestratorTurn) => {
  pendingTurns.delete(key);

  const inboundText = turn.texts.join("\n").trim();
  if (!inboundText && turn.images.length === 0) return;

  const spaceId = turn.space.id;
  registerSpace(spaceId, turn.space, turn.message);

  console.log(`[bounce] Flush space ${spaceId}:`, inboundText.slice(0, 120));

  try {
    await turn.message.read();
  } catch (error) {
    console.warn("[bounce] Failed to mark message read", error);
  }

  console.log(`[bounce] Starting interaction for space ${spaceId}`);

  const tapback = getTapbackOnlyRequest(inboundText);
  if (tapback) {
    await deliverOutbound(
      turn.space,
      [{ kind: "reaction", emoji: tapback }],
      { targetMessage: turn.message },
    );
    console.log(`[bounce] Completed direct ${tapback} tapback for space ${spaceId}`);
    return;
  }

  let outbound: OutboundItem[];
  try {
    ({ outbound } = await runInteractionAgent(spaceId, {
      kind: "user_message",
      text: inboundText,
      images: turn.images,
    }));
  } catch (error) {
    console.error(`[bounce] Interaction failed for space ${spaceId}`, getGmiErrorDetails(error));
    await deliverOutbound(
      turn.space,
      [{ kind: "reaction", emoji: "like" }],
      { targetMessage: turn.message },
    );
    return;
  }

  if (outbound.length === 0) {
    console.log(
      "[bounce] Turn complete (tools already sent, or waiting on sub-agent)",
    );
    return;
  }

  console.log(`[bounce] Delivering ${outbound.length} queued outbound item(s) for space ${spaceId}`);
  await deliverOutbound(turn.space, outbound, { targetMessage: turn.message });
  console.log(`[bounce] Completed turn for space ${spaceId}`);
};

/** Debounces pending turns and flushes the latest value for each key. */
const debounce = createKeyedDebounce<OrchestratorTurn>({
  delayMs: getOrchestratorDebounceMs,
  onFlush: flushOrchestratorTurn,
});

/**
 * Schedules an orchestrator turn.
 * @param input - The input to schedule an orchestrator turn.
 */
export const scheduleOrchestratorTurn = (input: ScheduleOrchestratorTurnInput): void => {
  const key = input.senderKey?.trim() || input.space.id;
  registerSpace(input.space.id, input.space, input.message);

  const next = buildDebouncedTurn(pendingTurns.get(key), input);
  pendingTurns.set(key, next);
  debounce.schedule(key, next);
};
