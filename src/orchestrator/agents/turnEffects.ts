import type { OutboundItem } from "../contracts";

/**
 * Collects outbound side effects for one interaction turn.
 * Tools push items; finalize merges model text and enforces at most one text item.
 */
export type TurnEffectCollector = {
  push: (item: OutboundItem) => void;
  finalize: (modelText: string) => OutboundItem[];
};

export const createTurnEffectCollector = (): TurnEffectCollector => {
  const effects: OutboundItem[] = [];

  return {
    push: (item) => {
      effects.push(item);
    },
    finalize: (modelText) => finalizeTurnOutbound(effects, modelText),
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
): OutboundItem[] => {
  const trimmedModelText = modelText.trim();
  const nonText = toolOutbound.filter((item) => item.kind !== "text");
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
