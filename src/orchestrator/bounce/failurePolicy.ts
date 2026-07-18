import type { OutboundItem } from "../contracts";

/** Fallback copy when an interaction turn fails. */
export const TURN_FAILURE_FALLBACK_TEXT =
  "something broke on my end, try again in a sec";

/**
 * Outbound delivered when a turn fails after logging the error.
 * Explicit policy — not a silent tapback.
 */
export const turnFailureOutbound = (): OutboundItem[] => [
  { kind: "text", text: TURN_FAILURE_FALLBACK_TEXT },
];
