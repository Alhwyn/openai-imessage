import type { InboundImage, OutboundItem } from "../contracts";

/** User message to the interaction agent. */
export type InteractionEvent = {
  /** Stable sender identity, or null when the provider did not supply one. */
  senderId: string | null;
  text: string;
  images?: InboundImage[];
};

/** Outbound queue for an interaction turn. */
export type InteractionResult = {
  outbound: OutboundItem[];
};
