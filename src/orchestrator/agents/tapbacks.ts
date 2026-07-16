import { Emoji } from "@spectrum-ts/core";

/** Spectrum iMessage tapbacks: tool key → native emoji. */
export const TAPBACKS = [
  { key: "love", emoji: Emoji.love },
  { key: "like", emoji: Emoji.like },
  { key: "dislike", emoji: Emoji.dislike },
  { key: "laugh", emoji: Emoji.laugh },
  { key: "emphasize", emoji: Emoji.emphasize },
  { key: "question", emoji: Emoji.question },
] as const;

export type TapbackKey = (typeof TAPBACKS)[number]["key"];

/** Non-empty tuple for `z.enum`. */
export const TAPBACK_KEYS = TAPBACKS.map((tapback) => tapback.key) as [
  TapbackKey,
  ...TapbackKey[],
];

const TAPBACK_ONLY_REQUEST =
  /^(?:(?:can|could|would|will)\s+(?:you|u)\s+|please\s+)?(?:react|tapback)(?:\s+to)?\s+(?:this|that|the|my)(?:\s+(?:message|text))?$/;

/**
 * Resolves an unambiguous tapback-only command without involving the model.
 * A generic reaction uses iMessage's neutral thumbs-up tapback.
 * @param text - Inbound message text.
 * @returns The requested tapback, or undefined for non-matching text.
 */
export const getTapbackOnlyRequest = (text: string): TapbackKey | undefined => {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");

  return TAPBACK_ONLY_REQUEST.test(normalized) ? "like" : undefined;
};

/**
 * Resolves a tapback key to its Spectrum emoji value.
 * @param key - Tapback key from the agent tool.
 * @returns Native tapback emoji string.
 */
export const tapbackEmoji = (key: TapbackKey): string => {
  const tapback = TAPBACKS.find((entry) => entry.key === key);
  if (!tapback) {
    throw new Error(`Unknown tapback: ${key}`);
  }
  return tapback.emoji;
};
