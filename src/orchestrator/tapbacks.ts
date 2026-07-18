import { Emoji } from "@spectrum-ts/core";

import type { TapbackKey } from "./contracts";

/** Spectrum iMessage tapbacks: tool key → native emoji. */
export const TAPBACKS = [
  { key: "love", emoji: Emoji.love },
  { key: "like", emoji: Emoji.like },
  { key: "dislike", emoji: Emoji.dislike },
  { key: "laugh", emoji: Emoji.laugh },
  { key: "emphasize", emoji: Emoji.emphasize },
  { key: "question", emoji: Emoji.question },
] as const satisfies ReadonlyArray<{ key: TapbackKey; emoji: string }>;

/** Non-empty tuple for `z.enum`. */
export const TAPBACK_KEYS = TAPBACKS.map((tapback) => tapback.key) as [
  TapbackKey,
  ...TapbackKey[],
];

/** Resolves a tapback key to its Spectrum emoji value. */
export const tapbackEmoji = (key: TapbackKey): string => {
  const tapback = TAPBACKS.find((entry) => entry.key === key);
  if (!tapback) {
    throw new Error(`Unknown tapback: ${key}`);
  }
  return tapback.emoji;
};
