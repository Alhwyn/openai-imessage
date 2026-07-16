import type { InboundImage } from "../agents/types";
import type { Message, Space } from "@spectrum-ts/core";

export type OrchestratorTurn = {
  images: InboundImage[];
  texts: string[];
  space: Space;
  message: Message;
  senderKey?: string;
};

export type BuildDebouncedTurnInput = {
  images?: InboundImage[];
  text: string;
  space: Space;
  message: Message;
  senderKey?: string;
};

export type ScheduleOrchestratorTurnInput = {
  images?: InboundImage[];
  space: Space;
  message: Message;
  text: string;
  senderKey?: string;
};
