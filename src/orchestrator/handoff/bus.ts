import { runExecutionAgent } from "../agents/execution";
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
  NotifyOrchestratorInput,
  SpaceHandle,
} from "./types";
import type { InteractionEvent, OutboundItem } from "../agents/types";
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
      await notifyOrchestrator({
        spaceId: input.spaceId,
        taskId,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[handoff] Worker failed for ${taskId}`, error);
      await notifyOrchestrator({
        spaceId: input.spaceId,
        taskId,
        result: `Sub-agent failed: ${message}`,
      });
    }
  })();

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
      await notifyOrchestrator({
        spaceId: input.spaceId,
        taskId,
        result: `Generated ${album.paths.length} image(s)`,
        album: {
          paths: album.paths,
          tempDir: album.tempDir,
          prompt: promptSummary,
          count: prompts.length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failImageTask(task, message);
      console.error(`[image-agent] Failed ${taskId}`, error);
      await notifyOrchestrator({
        spaceId: input.spaceId,
        taskId,
        result: `Image generation failed: ${message}`,
        albumFailure: {
          prompt: promptSummary,
          count: prompts.length,
          error: message,
          tempDir,
        },
      });
    }
  })();

  return {
    taskId,
    status: "started",
    estimatedSeconds: Math.ceil(task.estimatedDurationMs / 1_000),
  };
};

const buildCompletionEvent = (input: NotifyOrchestratorInput): InteractionEvent => {
  if (input.album) {
    return {
      kind: "image_task_completion",
      taskId: input.taskId,
      ok: true,
      prompt: input.album.prompt,
      count: input.album.count,
      paths: input.album.paths,
    };
  }

  if (input.albumFailure) {
    return {
      kind: "image_task_completion",
      taskId: input.taskId,
      ok: false,
      prompt: input.albumFailure.prompt,
      count: input.albumFailure.count,
      paths: [],
      error: input.albumFailure.error,
    };
  }

  return {
    kind: "subagent_completion",
    taskId: input.taskId,
    result: input.result,
  };
};

/**
 * Notifies the orchestrator of a task completion.
 * @param input - The input to notify the orchestrator.
 * @returns Nothing after the completion has been delivered or dropped.
 */
export const notifyOrchestrator = async (input: NotifyOrchestratorInput): Promise<void> => {
  const lockKey = `${input.spaceId}:${input.taskId}`;
  if (inFlight.has(lockKey)) {
    console.warn(`[handoff] Skipping duplicate notify for ${lockKey}`);
    return;
  }

  inFlight.add(lockKey);
  const tempDir = input.album?.tempDir ?? input.albumFailure?.tempDir;

  try {
    console.log(
      `[handoff] Notify orchestrator ${input.taskId}:`,
      input.result.slice(0, 160),
    );

    const space = getRegisteredSpace(input.spaceId);
    if (!space) {
      console.error(`[handoff] No space registered for ${input.spaceId}; dropping completion`);
      return;
    }

    // Dynamic import avoids a cycle: interaction → assignTask → notify → interaction
    const { runInteractionAgent } = await import("../agents/interaction");
    const targetMessage = spaces.get(input.spaceId)?.lastInboundMessage;

    let outbound: OutboundItem[];
    try {
      ({ outbound } = await runInteractionAgent(
        input.spaceId,
        buildCompletionEvent(input),
      ));
    } catch (error) {
      console.error(
        `[handoff] Orchestrator failed for ${input.taskId}`,
        getGmiErrorDetails(error),
      );
      await deliverOutbound(
        space,
        [{ kind: "reaction", emoji: "like" }],
        { targetMessage },
      );
      return;
    }

    if (input.album?.paths.length) {
      outbound = [{ kind: "album", paths: input.album.paths }, ...outbound];
    }

    if (outbound.length === 0) {
      console.log(`[handoff] Turn complete for ${input.taskId} (tools already sent)`);
      return;
    }

    await deliverOutbound(space, outbound, { targetMessage });
  } finally {
    inFlight.delete(lockKey);
    await cleanupImageAlbum(tempDir);
  }
};
