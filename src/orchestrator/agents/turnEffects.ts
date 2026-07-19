import type { OutboundItem } from "../contracts";

/**
 * How model/tool text is merged into the turn's outbound payload.
 * - include_model: model text wins; else latest tool text
 * - tools_only: keep tool text, drop model text (image ack)
 * - non_text_only: drop all text (computer app card only)
 */
export type TextPolicy = "include_model" | "tools_only" | "non_text_only";

/**
 * Collects outbound side effects for one interaction turn.
 * Tools push items; finalize merges model text per TextPolicy.
 */
export type TurnEffectCollector = {
  push: (item: OutboundItem) => void;
  setTextPolicy: (policy: TextPolicy) => void;
  finalize: (modelText: string) => OutboundItem[];
};

export const createTurnEffectCollector = (): TurnEffectCollector => {
  const effects: OutboundItem[] = [];
  let textPolicy: TextPolicy = "include_model";

  return {
    push: (item) => {
      effects.push(item);
    },
    setTextPolicy: (policy) => {
      textPolicy = policy;
    },
    finalize: (modelText) =>
      finalizeTurnOutbound(effects, modelText, textPolicy),
  };
};

/**
 * Merges tool-queued outbound with optional model text.
 * Non-text items are preserved in order; at most one text item is kept.
 */
export const finalizeTurnOutbound = (
  toolOutbound: OutboundItem[],
  modelText: string,
  textPolicy: TextPolicy = "include_model",
): OutboundItem[] => {
  const nonText = toolOutbound.filter((item) => item.kind !== "text");
  if (textPolicy === "non_text_only") return nonText;

  const toolTexts = toolOutbound.filter(
    (item): item is Extract<OutboundItem, { kind: "text" }> => item.kind === "text",
  );
  const trimmedModelText =
    textPolicy === "tools_only" ? "" : modelText.trim();

  if (trimmedModelText) {
    return [...nonText, { kind: "text", text: trimmedModelText }];
  }

  const latestToolText = toolTexts.at(-1);
  if (latestToolText) {
    return [...nonText, latestToolText];
  }

  return nonText;
};
