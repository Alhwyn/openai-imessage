import type { Space } from "@spectrum-ts/core";

export type SpaceHandle = {
  space: Space;
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
