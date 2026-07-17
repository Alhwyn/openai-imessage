import type { ImageTaskRecord, ImageTaskStatus } from "./types";
import type { ImageGenerationProgress } from "../utils/types";

const DEFAULT_IMAGE_TASK_DURATION_MS = 120_000;
const MINIMUM_REMAINING_MS = 5_000;

const latestTaskBySpace = new Map<string, ImageTaskRecord>();

let estimatedTaskDurationMs = DEFAULT_IMAGE_TASK_DURATION_MS;

const remainingTimeMs = (task: ImageTaskRecord, now: number): number => {
  if (task.state === "completed" || task.state === "failed") return 0;
  return Math.max(
    MINIMUM_REMAINING_MS,
    task.estimatedDurationMs - (now - task.startedAt),
  );
};

/** Creates and registers a queued image task. */
export const startImageTask = (
  spaceId: string,
  taskId: string,
  prompt: string,
  totalImages: number,
): ImageTaskRecord => {
  const task: ImageTaskRecord = {
    taskId,
    prompt,
    state: "queued",
    completedImages: 0,
    totalImages,
    startedAt: Date.now(),
    estimatedDurationMs: estimatedTaskDurationMs,
  };
  latestTaskBySpace.set(spaceId, task);
  return task;
};

/** Creates the callback hook used by the image worker to publish progress. */
export const createImageTaskProgressHook = (
  task: ImageTaskRecord,
  onChange?: (progress: ImageGenerationProgress) => void,
): ((progress: ImageGenerationProgress) => void) => {
  return (progress) => {
    const changed =
      task.state !== progress.phase ||
      task.completedImages !== progress.completedImages;
    task.state = progress.phase;
    task.completedImages = progress.completedImages;
    if (changed) onChange?.(progress);
  };
};

/** Marks image generation and local staging as complete. */
export const completeImageTask = (
  task: ImageTaskRecord,
  completedImages: number,
): void => {
  task.state = "completed";
  task.completedImages = completedImages;
  task.finishedAt = Date.now();

  const durationMs = task.finishedAt - task.startedAt;
  estimatedTaskDurationMs = estimatedTaskDurationMs * 0.8 + durationMs * 0.2;
};

/** Marks an image task as failed with its public error message. */
export const failImageTask = (task: ImageTaskRecord, error: string): void => {
  task.state = "failed";
  task.error = error;
  task.finishedAt = Date.now();
};

/** Gets actual progress for the latest image task in a space. */
export const getImageTaskStatus = (
  spaceId: string,
): ImageTaskStatus | undefined => {
  const task = latestTaskBySpace.get(spaceId);
  if (!task) return undefined;

  const now = task.finishedAt ?? Date.now();
  return {
    taskId: task.taskId,
    prompt: task.prompt,
    state: task.state,
    completedImages: task.completedImages,
    totalImages: task.totalImages,
    elapsedSeconds: Math.ceil((now - task.startedAt) / 1_000),
    estimatedSecondsRemaining: Math.ceil(remainingTimeMs(task, now) / 1_000),
    error: task.error,
  };
};
