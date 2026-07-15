
import { runExecutionAgent } from "../agents/execution";
import { deliverReplies } from "../utils/index";

import type {
  AssignTaskInput,
  AssignTaskResult,
  NotifyOrchestratorInput,
  SpaceHandle,
} from "./types";
import type { Space } from "@spectrum-ts/core";

const spaces = new Map<string, SpaceHandle>();
const inFlight = new Set<string>();

let taskCounter = 0;

/**
 * Registers a space.
 * @param spaceId - The space ID.
 * @param space - The space to register.
 */
export const registerSpace = (spaceId: string, space: Space): void => {
  spaces.set(spaceId, { space });
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
      const result = await runExecutionAgent(input.task);
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
    const { replies } = await runInteractionAgent(input.spaceId, {
      kind: "subagent_completion",
      taskId: input.taskId,
      result: input.result,
    });

    if (replies.length === 0) {
      console.warn(`[handoff] Orchestrator produced no reply for ${input.taskId}`);
      return;
    }

    await space.responding(async () => {
      await deliverReplies(space, replies);
    });
  } finally {
    inFlight.delete(lockKey);
  }
};
