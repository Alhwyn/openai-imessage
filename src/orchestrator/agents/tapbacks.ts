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

const TAPBACK_ACTION_REQUEST =
  /^(?:(?:can|could|would|will)\s+(?:you|u)\s+|please\s+)?(?:react|tapback)(?:(?:\s+to)?\s+(?:this|that|the|my)(?:\s+(?:message|text))?)?$/;

const TAPBACK_ALIASES: ReadonlyArray<{
  key: TapbackKey;
  aliases: readonly string[];
}> = [
  { key: "love", aliases: ["love", "heart"] },
  { key: "like", aliases: ["thumbs up", "like"] },
  { key: "dislike", aliases: ["thumbs down", "dislike"] },
  { key: "laugh", aliases: ["laugh", "haha"] },
  { key: "emphasize", aliases: ["emphasize", "exclamation"] },
  { key: "question", aliases: ["question mark", "question"] },
];

const removeAlias = (text: string, alias: string): string | undefined => {
  const padded = ` ${text} `;
  const needle = ` ${alias} `;
  const index = padded.indexOf(needle);
  if (index === -1) return undefined;
  return `${padded.slice(0, index)} ${padded.slice(index + needle.length)}`.trim();
};

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

  if (TAPBACK_ONLY_REQUEST.test(normalized)) return "like";

  for (const { key, aliases } of TAPBACK_ALIASES) {
    for (const alias of aliases) {
      const withoutAlias = removeAlias(normalized, alias);
      if (withoutAlias === undefined) continue;

      const command = withoutAlias
        .replace(/\b(?:with|a|an)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (TAPBACK_ACTION_REQUEST.test(command)) return key;
    }
  }

  return undefined;
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
