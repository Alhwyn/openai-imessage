import type { TapbackKey } from "./tapbacks";
import type { ModelMessage } from "ai";

export type { TapbackKey } from "./tapbacks";

/** In-memory image input forwarded to a vision-capable model. */
export type InboundImage = {
  data: Uint8Array;
  filename: string;
  mediaType: string;
};

/** User message to the interaction agent. */
export type InteractionEvent = {
  kind: "user_message";
  text: string;
  images?: InboundImage[];
};

/** Items not already sent by tools (fallback delivery). */
export type OutboundItem =
  | { kind: "text"; text: string }
  | { kind: "reaction"; emoji: TapbackKey }
  | { kind: "album"; paths: string[] };

/** Outbound queue and updated history for an interaction turn. */
export type InteractionResult = {
  outbound: OutboundItem[];
  messages: ModelMessage[];
};
