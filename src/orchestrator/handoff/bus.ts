import { runExecutionAgent } from "../agents/execution";
import { appendHistory } from "../memory/index";
import {
  cleanupImageAlbum,
  deliverOutbound,
  generateGmiImages,
  getGmiErrorDetails,
} from "../utils/index";

import {
  completeImageTask,
  createImageTaskProgressHook,
  failImageTask,
  startImageTask,
} from "./imageTaskTracker";

import type {
  AssignImageTaskInput,
  AssignImageTaskResult,
  AssignTaskInput,
  AssignTaskResult,
  SpaceHandle,
} from "./types";
import type { OutboundItem } from "../agents/types";
import type { Message, Space } from "@spectrum-ts/core";

const spaces = new Map<string, SpaceHandle>();
const inFlight = new Set<string>();

let taskCounter = 0;

/**
 * Registers a space and optionally remembers the latest inbound message.
 * @param spaceId - The space ID.
 * @param space - The space to register.
 * @param lastInboundMessage - Latest inbound message for replies/reactions.
 */
export const registerSpace = (
  spaceId: string,
  space: Space,
  lastInboundMessage?: Message,
): void => {
  const existing = spaces.get(spaceId);
  spaces.set(spaceId, {
    space,
    lastInboundMessage: lastInboundMessage ?? existing?.lastInboundMessage,
  });
};

/**
 * Gets a registered space.
 * @param spaceId - The space ID.
 * @returns The registered space or undefined if not found.
 */
export const getRegisteredSpace = (spaceId: string): Space | undefined => {
  return spaces.get(spaceId)?.space;
};

const deliveryTarget = (spaceId: string): Message | undefined => {
  return spaces.get(spaceId)?.lastInboundMessage;
};

const deliverTaskOutput = async (
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
    const space = getRegisteredSpace(spaceId);
    if (!space) {
      console.error(`[handoff] No space registered for ${spaceId}; dropping completion`);
      return;
    }

    if (outbound.length > 0) {
      console.log(`[handoff] Delivering ${taskId}`, {
        outboundCount: outbound.length,
        items: outbound.map((item) =>
          item.kind === "text"
            ? { kind: item.kind, preview: item.text.slice(0, 80) }
            : item.kind === "album"
              ? { kind: item.kind, pathCount: item.paths.length }
              : { kind: item.kind, emoji: item.emoji },
        ),
      });
      await deliverOutbound(space, outbound, { targetMessage: deliveryTarget(spaceId) });
    }

    await appendHistory(spaceId, { role: "assistant", content: historyText });
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
      completeImageTask(task, album.paths.length);
      console.log(`[image-agent] Completed ${taskId}`, {
        generatedImages: album.paths.length,
        elapsedMs: (task.finishedAt ?? Date.now()) - task.startedAt,
      });
      await deliverTaskOutput(
        input.spaceId,
        taskId,
        [{ kind: "album", paths: album.paths }],
        `[Sent ${album.paths.length} generated image(s)]`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!tempDir) {
        failImageTask(task, message);
        console.error(`[image-agent] Failed ${taskId}`, error);
        const apology = "couldnt generate those images, something broke on my end";
        await deliverTaskOutput(
          input.spaceId,
          taskId,
          [{ kind: "text", text: apology }],
          `${apology} (${message})`,
        );
      } else {
        console.error(`[image-agent] Delivery failed for ${taskId}`, error);
        const apology = "made the images but couldnt send them, upload choked";
        await deliverTaskOutput(
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
