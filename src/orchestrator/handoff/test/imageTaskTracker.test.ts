import { describe, expect, test } from "bun:test";

import {
  completeImageTask,
  createImageTaskProgressHook,
  failImageTask,
  getImageTaskStatus,
  markImageTaskDelivering,
  startImageTask,
} from "../imageTaskTracker";

describe("imageTaskTracker", () => {
  test("tracks worker progress through the progress hook", () => {
    const task = startImageTask("space-progress", "image-1", "three cats", 3);
    const changes: string[] = [];
    const reportProgress = createImageTaskProgressHook(task, (progress) => {
      changes.push(`${progress.phase}:${progress.completedImages}`);
    });

    reportProgress({
      phase: "processing",
      completedImages: 1,
      totalImages: 3,
    });
    reportProgress({
      phase: "processing",
      completedImages: 1,
      totalImages: 3,
    });

    expect(getImageTaskStatus("space-progress")).toMatchObject({
      taskId: "image-1",
      state: "processing",
      completedImages: 1,
      totalImages: 3,
    });
    expect(changes).toEqual(["processing:1"]);

    markImageTaskDelivering(task, 3);
    expect(getImageTaskStatus("space-progress")).toMatchObject({
      state: "delivering",
      completedImages: 3,
    });

    completeImageTask(task, 3);
    expect(getImageTaskStatus("space-progress")).toMatchObject({
      state: "completed",
      completedImages: 3,
      estimatedSecondsRemaining: 0,
    });
  });

  test("retains failure details for status requests", () => {
    const task = startImageTask("space-failure", "image-2", "blocked", 1);

    failImageTask(task, "moderation blocked");

    expect(getImageTaskStatus("space-failure")).toMatchObject({
      state: "failed",
      error: "moderation blocked",
      estimatedSecondsRemaining: 0,
    });
  });
});
