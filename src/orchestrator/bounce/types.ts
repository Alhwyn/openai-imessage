import type { Message, Space } from "@spectrum-ts/core";

export type OrchestratorTurn = {
  texts: string[];
  space: Space;
  message: Message;
  senderKey?: string;
};

export type BuildDebouncedTurnInput = {
  text: string;
  space: Space;
  message: Message;
  senderKey?: string;
};

export type ScheduleOrchestratorTurnInput = {
  space: Space;
  message: Message;
  text: string;
  senderKey?: string;
};
