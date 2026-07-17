import type { InboundImage } from "../agents/types";
import type { Message, Space } from "@spectrum-ts/core";

export type SpaceHandle = {
  space: Space;
  /** Latest inbound message; used for tapbacks / threaded replies after handoff. */
  lastInboundMessage?: Message;
};

export type AssignTaskInput = {
  images?: InboundImage[];
  spaceId: string;
  task: string;
};

export type AssignImageTaskInput = {
  spaceId: string;
  /** One prompt per image to generate. */
  prompts: string[];
};

export type AssignTaskResult = {
  taskId: string;
  status: "started";
};

export type AssignImageTaskResult = AssignTaskResult & {
  estimatedSeconds: number;
};

export type ImageTaskState =
  | "queued"
  | "processing"
  | "downloading"
  | "completed"
  | "failed";

/** Actual progress for the latest image-generation task in a space. */
export type ImageTaskStatus = {
  taskId: string;
  prompt: string;
  state: ImageTaskState;
  completedImages: number;
  totalImages: number;
  elapsedSeconds: number;
  estimatedSecondsRemaining: number;
  error?: string;
};

/** Internal timing data retained while tracking an image-generation task. */
export type ImageTaskRecord = {
  taskId: string;
  prompt: string;
  state: ImageTaskState;
  completedImages: number;
  totalImages: number;
  startedAt: number;
  estimatedDurationMs: number;
  finishedAt?: number;
  error?: string;
};

