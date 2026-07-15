import type { Message, Space } from "@spectrum-ts/core";
import type { ModelMessage } from "ai";

export type InteractionEvent =
  | { kind: "user_message"; text: string }
  | { kind: "subagent_completion"; taskId: string; result: string };

export type InteractionResult = {
  replies: string[];
  messages: ModelMessage[];
};

export type OrchestratorTurn = {
  texts: string[];
  space: Space;
  message: Message;
  senderKey?: string;
};
