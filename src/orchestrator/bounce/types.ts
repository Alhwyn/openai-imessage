import type { InboundImage } from "../contracts";
import type { Message, Space } from "@spectrum-ts/core";

export type OrchestratorTurn = {
  images: InboundImage[];
  texts: string[];
  space: Space;
  message: Message;
  senderId: string | null;
};

export type BuildDebouncedTurnInput = {
  images?: InboundImage[];
  text: string;
  space: Space;
  message: Message;
  senderId: string | null;
};

export type ScheduleOrchestratorTurnInput = {
  images?: InboundImage[];
  space: Space;
  message: Message;
  text: string;
  senderId: string | null;
};
