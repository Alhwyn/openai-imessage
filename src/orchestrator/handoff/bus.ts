import { appendHistory } from "../memory/index";
import { summarizeOutbound } from "../outbound";
import {
  cleanupImageAlbum,
  deliverOutbound,
  generateGmiImages,
  getGmiErrorDetails,
} from "../utils/index";
import { runExecutionAgent } from "../workers/execution";

import {
  completeImageTask,
  createImageTaskProgressHook,
  failImageTask,
  markImageTaskDelivering,
  startImageTask,
} from "./imageTaskTracker";

import type {
  AssignImageTaskInput,
  AssignImageTaskResult,
  AssignTaskInput,
  AssignTaskResult,
  DeliveryTarget,
} from "./types";
import type { OutboundItem } from "../contracts";

const inFlight = new Set<string>();

let taskCounter = 0;

const deliverTaskOutput = async (
  target: DeliveryTarget,
  spaceId: string,
  taskId: string,
  outbound: OutboundItem[],
  historyText: string,
): Promise<void> => {
  const lockKey = `${spaceId}:${taskId}`;
  if (inFlight.has(lockKey)) {
    console.warn(`[handoff] Skipping duplicate delivery for ${lockKey}`);
    return;
  }

  inFlight.add(lockKey);
  try {
    if (outbound.length > 0) {
      console.log(`[handoff] Delivering ${taskId}`, {
        outboundCount: outbound.length,
        items: summarizeOutbound(outbound),
      });
      await deliverOutbound(target.space, outbound, {
        targetMessage: target.message,
      });
    }

    try {
      await appendHistory(spaceId, { role: "assistant", content: historyText });
    } catch (error) {
      console.error(`[handoff] Failed to persist history for ${taskId}`, error);
    }
  } finally {
    inFlight.delete(lockKey);
  }
};

/**
 * Assigns a task to an execution sub-agent.
 * @param input - The input to assign a task.
 * @returns The task ID and status.
 */
export const assignTask = (input: AssignTaskInput): AssignTaskResult => {
  taskCounter += 1;
  const taskId = `task_${Date.now()}_${taskCounter}`;

  console.log(`[handoff] Assigned ${taskId} for space ${input.spaceId}:`, input.task.slice(0, 120));

  void (async () => {
    try {
      const result = await runExecutionAgent(input.task, input.images);
      await deliverTaskOutput(
        input.deliveryTarget,
        input.spaceId,
        taskId,
        [{ kind: "text", text: result }],
        result,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[handoff] Worker failed for ${taskId}`, error);
      const apology = `couldnt finish that task: ${message}`;
      await deliverTaskOutput(
        input.deliveryTarget,
        input.spaceId,
        taskId,
        [{ kind: "text", text: apology }],
        apology,
      );
    }
  })().catch((error: unknown) => {
    console.error(`[handoff] Unhandled task failure for ${taskId}`, {
      ...getGmiErrorDetails(error),
    });
  });

  return { taskId, status: "started" };
};

/**
 * Assigns an image-generation task to a dedicated sub-agent.
 * @param input - One prompt per image to generate.
 * @returns The task ID and status.
 */
export const assignImageTask = (input: AssignImageTaskInput): AssignImageTaskResult => {
  const prompts = input.prompts.map((prompt) => prompt.trim()).filter(Boolean);
  if (prompts.length === 0) {
    throw new Error("At least one image prompt is required");
  }

  taskCounter += 1;
  const taskId = `image_${Date.now()}_${taskCounter}`;
  const promptSummary = prompts.join("; ");
  const task = startImageTask(
    input.spaceId,
    taskId,
    promptSummary,
    prompts.length,
  );

  console.log(
    `[handoff] Assigned ${taskId} for space ${input.spaceId}: generate ${prompts.length} image(s)`,
    promptSummary.slice(0, 120),
  );

  void (async () => {
    let tempDir: string | undefined;
    try {
      console.log(`[image-agent] Starting ${taskId}`, {
        count: prompts.length,
        promptPreview: promptSummary.slice(0, 120),
      });
      const album = await generateGmiImages(prompts, {
        onProgress: createImageTaskProgressHook(task, (progress) => {
          console.log(`[image-agent] Progress ${taskId}`, {
            phase: progress.phase,
            completedImages: progress.completedImages,
            totalImages: progress.totalImages,
          });
        }),
      });
      tempDir = album.tempDir;
      markImageTaskDelivering(task, album.paths.length);
      await deliverTaskOutput(
        input.deliveryTarget,
        input.spaceId,
        taskId,
        [{ kind: "album", paths: album.paths }],
        `[Sent ${album.paths.length} generated image(s)]`,
      );
      completeImageTask(task, album.paths.length);
      console.log(`[image-agent] Completed ${taskId}`, {
        generatedImages: album.paths.length,
        elapsedMs: (task.finishedAt ?? Date.now()) - task.startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!tempDir) {
        failImageTask(task, message);
        console.error(`[image-agent] Failed ${taskId}`, error);
        const apology = "couldnt generate those images, something broke on my end";
        await deliverTaskOutput(
          input.deliveryTarget,
          input.spaceId,
          taskId,
          [{ kind: "text", text: apology }],
          `${apology} (${message})`,
        );
      } else {
        failImageTask(task, message);
        console.error(`[image-agent] Delivery failed for ${taskId}`, error);
        const apology = "made the images but couldnt send them, upload choked";
        await deliverTaskOutput(
          input.deliveryTarget,
          input.spaceId,
          `${taskId}:delivery`,
          [{ kind: "text", text: apology }],
          `${apology} (${message})`,
        ).catch(() => undefined);
      }
    } finally {
      await cleanupImageAlbum(tempDir);
    }
  })().catch((error: unknown) => {
    console.error(`[image-agent] Unhandled task failure for ${taskId}`, {
      ...getGmiErrorDetails(error),
    });
  });

  return {
    taskId,
    status: "started",
    estimatedSeconds: Math.ceil(task.estimatedDurationMs / 1_000),
  };
};
