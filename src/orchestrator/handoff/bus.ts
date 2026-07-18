import {
  ComputerApprovalRequiredError,
  getComputerLiveViewUrl,
  runComputerAgent,
} from "../computer/index";
import {
  completeComputerRun,
  createComputerRun,
  failComputerRun,
  getLatestComputerRunForSpace,
  markComputerRunRunning,
  updateComputerRunProgress,
} from "../db/index";
import {
  cleanupImageAlbum,
  generateGmiImages,
} from "../integrations/gmiImages";
import { recordAssistantText } from "../memory/index";
import { summarizeOutbound } from "../outbound";
import { deliverOutbound, getGmiErrorDetails } from "../utils/index";
import { runExecutionAgent } from "../workers/execution";

import {
  completeImageTask,
  createImageTaskProgressHook,
  failImageTask,
  markImageTaskDelivering,
  startImageTask,
} from "./imageTaskTracker";

import type {
  AssignComputerTaskInput,
  AssignComputerTaskResult,
  AssignImageTaskInput,
  AssignImageTaskResult,
  AssignTaskInput,
  AssignTaskResult,
  DeliveryTarget,
} from "./types";
import type { OutboundItem } from "../contracts";

/** Immediate acknowledgment owned by the image handoff path. */
export const IMAGE_TASK_ACK_TEXT = "got u, making those now, gimme a sec";

const inFlight = new Set<string>();

let taskCounter = 0;

type HandoffWorkResult = {
  outbound: OutboundItem[];
  historyText: string;
};

type HandoffFailureKind = "work" | "delivery";

type RunHandoffTaskInput = {
  spaceId: string;
  deliveryTarget: DeliveryTarget;
  taskId: string;
  label: string;
  execute: () => Promise<HandoffWorkResult>;
  onFailure?: (error: unknown, kind: HandoffFailureKind) => HandoffWorkResult;
  afterSuccess?: () => void;
  afterFailure?: (error: unknown, kind: HandoffFailureKind) => void;
  cleanup?: () => Promise<void>;
};

const defaultApology = (message: string): HandoffWorkResult => {
  const apology = `couldnt finish that task: ${message}`;
  return {
    outbound: [{ kind: "text", text: apology }],
    historyText: apology,
  };
};

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
      await recordAssistantText(spaceId, historyText);
    } catch (error) {
      console.error(`[handoff] Failed to persist history for ${taskId}`, error);
    }
  } finally {
    inFlight.delete(lockKey);
  }
};

/**
 * Runs async handoff work once: execute → deliver → history, with normalized failures.
 */
const runHandoffTask = (input: RunHandoffTaskInput): void => {
  void (async () => {
    let workFinished = false;
    try {
      const result = await input.execute();
      workFinished = true;
      await deliverTaskOutput(
        input.deliveryTarget,
        input.spaceId,
        input.taskId,
        result.outbound,
        result.historyText,
      );
      input.afterSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const kind: HandoffFailureKind = workFinished ? "delivery" : "work";
      console.error(
        `[handoff] ${input.label} failed (${kind}) for ${input.taskId}`,
        error,
      );
      input.afterFailure?.(error, kind);
      const failure = input.onFailure?.(error, kind) ?? defaultApology(message);
      const deliveryTaskId =
        kind === "delivery" ? `${input.taskId}:delivery` : input.taskId;
      await deliverTaskOutput(
        input.deliveryTarget,
        input.spaceId,
        deliveryTaskId,
        failure.outbound,
        failure.historyText,
      ).catch(() => undefined);
    } finally {
      await input.cleanup?.();
    }
  })().catch((error: unknown) => {
    console.error(`[handoff] Unhandled failure for ${input.taskId}`, {
      ...getGmiErrorDetails(error),
    });
  });
};

/**
 * Assigns a task to an execution sub-agent.
 */
export const assignTask = (input: AssignTaskInput): AssignTaskResult => {
  taskCounter += 1;
  const taskId = `task_${Date.now()}_${taskCounter}`;

  console.log(
    `[handoff] Assigned ${taskId} for space ${input.spaceId}:`,
    input.task.slice(0, 120),
  );

  runHandoffTask({
    spaceId: input.spaceId,
    deliveryTarget: input.deliveryTarget,
    taskId,
    label: "Worker",
    execute: async () => {
      const result = await runExecutionAgent(
        input.task,
        input.images,
        input.senderId,
      );
      return {
        outbound: [{ kind: "text", text: result }],
        historyText: result,
      };
    },
  });

  return { taskId, status: "started" };
};

/**
 * Assigns a task to the local Linux computer-use worker.
 * @param input - The computer task and delivery target.
 * @returns Durable task metadata and the live desktop URL.
 */
export const assignComputerTask = async (
  input: AssignComputerTaskInput,
): Promise<AssignComputerTaskResult> => {
  const goal = input.goal.trim();
  if (!goal) throw new Error("Computer task goal is required");

  taskCounter += 1;
  const taskId = `computer_${Date.now()}_${taskCounter}`;
  const liveViewUrl = getComputerLiveViewUrl();

  await createComputerRun({
    taskId,
    spaceId: input.spaceId,
    goal,
    liveViewUrl,
  });

  console.log(`[handoff] Assigned ${taskId} for space ${input.spaceId}:`, goal.slice(0, 120));

  void (async () => {
    try {
      await markComputerRunRunning(taskId);
      const result = await runComputerAgent({
        goal,
        runId: taskId,
        onProgress: ({ step, lastAction }) =>
          updateComputerRunProgress(taskId, step, lastAction),
      });
      await completeComputerRun({
        taskId,
        resultSummary: result.summary,
        recordingPath: result.recordingPath,
        step: result.steps,
      });
      await deliverTaskOutput(
        input.deliveryTarget,
        input.spaceId,
        taskId,
        [{ kind: "text", text: result.summary }],
        result.summary,
      );
    } catch (error) {
      const needsApproval = error instanceof ComputerApprovalRequiredError;
      const message = error instanceof Error ? error.message : String(error);
      await failComputerRun({
        taskId,
        error: message,
        awaitingApproval: needsApproval,
      }).catch((persistenceError: unknown) => {
        console.error(`[computer-agent] Failed to persist failure for ${taskId}`, persistenceError);
      });
      const userMessage = needsApproval
        ? "computer task paused before a restricted action, use the live viewer to take over"
        : `couldnt finish that computer task: ${message}`;
      await deliverTaskOutput(
        input.deliveryTarget,
        input.spaceId,
        taskId,
        [{ kind: "text", text: userMessage }],
        userMessage,
      );
    }
  })().catch((error: unknown) => {
    console.error(`[computer-agent] Unhandled task failure for ${taskId}`, {
      ...getGmiErrorDetails(error),
    });
  });

  return { taskId, status: "started", liveViewUrl };
};

export const getComputerTaskStatus = getLatestComputerRunForSpace;

/**
 * Assigns an image-generation task to a dedicated sub-agent.
 */
export const assignImageTask = (
  input: AssignImageTaskInput,
): AssignImageTaskResult => {
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

  let tempDir: string | undefined;
  let generatedCount = 0;

  runHandoffTask({
    spaceId: input.spaceId,
    deliveryTarget: input.deliveryTarget,
    taskId,
    label: "Image agent",
    execute: async () => {
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
      generatedCount = album.paths.length;
      markImageTaskDelivering(task, generatedCount);
      return {
        outbound: [{ kind: "album", paths: album.paths }],
        historyText: `[Sent ${album.paths.length} generated image(s)]`,
      };
    },
    onFailure: (error, kind) => {
      const message = error instanceof Error ? error.message : String(error);
      const apology =
        kind === "delivery"
          ? "made the images but couldnt send them, upload choked"
          : "couldnt generate those images, something broke on my end";
      return {
        outbound: [{ kind: "text", text: apology }],
        historyText: `${apology} (${message})`,
      };
    },
    afterSuccess: () => {
      completeImageTask(task, generatedCount);
      console.log(`[image-agent] Completed ${taskId}`, {
        generatedImages: generatedCount,
        elapsedMs: (task.finishedAt ?? Date.now()) - task.startedAt,
      });
    },
    afterFailure: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      failImageTask(task, message);
    },
    cleanup: async () => {
      await cleanupImageAlbum(tempDir);
    },
  });

  return {
    taskId,
    status: "started",
    estimatedSeconds: Math.ceil(task.estimatedDurationMs / 1_000),
    acknowledgment: IMAGE_TASK_ACK_TEXT,
  };
};
