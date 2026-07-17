import type { InboundImage, OutboundItem } from "../contracts";

export type { InboundImage, OutboundItem, TapbackKey } from "../contracts";

/** User message to the interaction agent. */
export type InteractionEvent = {
  kind: "user_message";
  /** Stable sender identity, or null when the provider did not supply one. */
  senderId: string | null;
  text: string;
  images?: InboundImage[];
};

/** Outbound queue for an interaction turn. */
export type InteractionResult = {
  outbound: OutboundItem[];
};
