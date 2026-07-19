import type { InboundImage } from "../contracts";
import type { Message, Space } from "@spectrum-ts/core";

export type DeliveryTarget = {
  space: Space;
  message: Message;
};

export type AssignTaskInput = {
  deliveryTarget: DeliveryTarget;
  images?: InboundImage[];
  /** Sender identity for scoped Composio tools in the execution worker. */
  senderId: string | null;
  spaceId: string;
  task: string;
};

export type AssignImageTaskInput = {
  deliveryTarget: DeliveryTarget;
  spaceId: string;
  /** One prompt per image to generate. */
  prompts: string[];
};

export type AssignComputerTaskInput = {
  deliveryTarget: DeliveryTarget;
  spaceId: string;
  goal: string;
};

export type AssignTaskResult = {
  taskId: string;
  status: "started";
};

export type AssignImageTaskResult = AssignTaskResult & {
  estimatedSeconds: number;
  /** Text acknowledgment the interaction turn should deliver immediately. */
  acknowledgment: string;
};

export type AssignComputerTaskResult = AssignTaskResult & {
  liveViewUrl?: string;
};

export type ImageTaskState =
  | "queued"
  | "processing"
  | "downloading"
  | "delivering"
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

