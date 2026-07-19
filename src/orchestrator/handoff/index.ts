import {
  assignComputerTask,
  assignImageTask,
  assignTask,
  getComputerTaskStatus,
} from "./bus";
import { getImageTaskStatus } from "./imageTaskTracker";

import type {
  AssignComputerTaskInput,
  AssignComputerTaskResult,
  AssignImageTaskInput,
  AssignImageTaskResult,
  AssignTaskInput,
  AssignTaskResult,
  DeliveryTarget,
  ImageTaskRecord,
  ImageTaskState,
  ImageTaskStatus,
} from "./types";

export {
  assignComputerTask,
  assignImageTask,
  assignTask,
  getComputerTaskStatus,
  getImageTaskStatus,
};
export type {
  AssignComputerTaskInput,
  AssignComputerTaskResult,
  AssignImageTaskInput,
  AssignImageTaskResult,
  AssignTaskInput,
  AssignTaskResult,
  DeliveryTarget,
  ImageTaskRecord,
  ImageTaskState,
  ImageTaskStatus,
};
