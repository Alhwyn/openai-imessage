import type { TapbackKey } from "./tapbacks";
import type { ModelMessage } from "ai";

export type { TapbackKey } from "./tapbacks";

/** In-memory image input forwarded to a vision-capable model. */
export type InboundImage = {
  data: Uint8Array;
  filename: string;
  mediaType: string;
};

/** User message or sub-agent completion. */
export type InteractionEvent =
  | { kind: "user_message"; text: string; images?: InboundImage[] }
  | { kind: "subagent_completion"; taskId: string; result: string }
  | {
      kind: "image_task_completion";
      taskId: string;
      ok: boolean;
      prompt: string;
      count: number;
      paths: string[];
      error?: string;
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
