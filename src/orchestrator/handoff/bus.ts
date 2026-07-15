import type { Space } from "@spectrum-ts/core";

import { runExecutionAgent } from "../agents/execution";
import { deliverReplies } from "../utils/index";

type SpaceHandle = {
  space: Space;
};

const spaces = new Map<string, SpaceHandle>();
const inFlight = new Set<string>();

let taskCounter = 0;

export const registerSpace = (spaceId: string, space: Space): void => {
  spaces.set(spaceId, { space });
};

export const getRegisteredSpace = (spaceId: string): Space | undefined => {
  return spaces.get(spaceId)?.space;
};

export const assignTask = (input: {
  spaceId: string;
  task: string;
}): { taskId: string; status: "started" } => {
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

export const notifyOrchestrator = async (input: {
  spaceId: string;
  taskId: string;
  result: string;
}): Promise<void> => {
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
