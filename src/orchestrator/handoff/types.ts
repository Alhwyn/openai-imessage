import type { Message, Space } from "@spectrum-ts/core";

export type SpaceHandle = {
  space: Space;
  /** Latest inbound message; used for tapbacks / threaded replies after handoff. */
  lastInboundMessage?: Message;
};

export type AssignTaskInput = {
  spaceId: string;
  task: string;
};

export type AssignTaskResult = {
  taskId: string;
  status: "started";
};

export type NotifyOrchestratorInput = {
  spaceId: string;
  taskId: string;
  result: string;
};
