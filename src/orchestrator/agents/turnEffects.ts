import type { OutboundItem } from "../contracts";

/**
 * Collects outbound side effects for one interaction turn.
 * Tools push items; finalize merges model text and enforces at most one text item.
 */
export type TurnEffectCollector = {
  push: (item: OutboundItem) => void;
  suppressText: () => void;
  /** Keep tool-queued text (e.g. image ack) but ignore model text for this turn. */
  suppressModelText: () => void;
  finalize: (modelText: string) => OutboundItem[];
};

export const createTurnEffectCollector = (): TurnEffectCollector => {
  const effects: OutboundItem[] = [];
  let textSuppressed = false;
  let modelTextSuppressed = false;

  return {
    push: (item) => {
      effects.push(item);
    },
    suppressText: () => {
      textSuppressed = true;
    },
    suppressModelText: () => {
      modelTextSuppressed = true;
    },
    finalize: (modelText) =>
      finalizeTurnOutbound(
        effects,
        modelText,
        textSuppressed,
        modelTextSuppressed,
      ),
  };
};

/**
 * Merges tool-queued outbound with optional model text.
 * Non-text items are preserved in order; at most one text item is kept
 * (model text wins when present, otherwise the latest tool text).
 */
export const finalizeTurnOutbound = (
  toolOutbound: OutboundItem[],
  modelText: string,
  suppressText = false,
  suppressModelText = false,
): OutboundItem[] => {
  const trimmedModelText = suppressModelText ? "" : modelText.trim();
  const nonText = toolOutbound.filter((item) => item.kind !== "text");
  if (suppressText) return nonText;

  const toolTexts = toolOutbound.filter(
    (item): item is Extract<OutboundItem, { kind: "text" }> => item.kind === "text",
  );

  if (trimmedModelText) {
    return [...nonText, { kind: "text", text: trimmedModelText }];
  }

  const latestToolText = toolTexts.at(-1);
  if (latestToolText) {
    return [...nonText, latestToolText];
  }

  return nonText;
};
