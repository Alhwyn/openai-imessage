import { api } from "../../../convex/_generated/api";

import { getBridgeSecret, getConvexClient } from "./client";

import type {
  ComputerRunEvent,
  ComputerRunStatus,
  ComputerViewerSnapshot,
} from "../computer/types";

export const createComputerRun = async (input: {
  taskId: string;
  spaceId: string;
  goal: string;
  liveViewUrl?: string;
  streamUrl?: string;
  viewerToken?: string;
}): Promise<ComputerRunStatus> => {
  return await getConvexClient().mutation(api.computerRuns.create, {
    secret: getBridgeSecret(),
    ...input,
  });
};

export const markComputerRunRunning = async (taskId: string): Promise<void> => {
  await getConvexClient().mutation(api.computerRuns.markRunning, {
    secret: getBridgeSecret(),
    taskId,
  });
};

export const updateComputerRunProgress = async (
  taskId: string,
  step: number,
  lastAction: string,
): Promise<void> => {
  await getConvexClient().mutation(api.computerRuns.updateProgress, {
    secret: getBridgeSecret(),
    taskId,
    step,
    lastAction,
  });
};

export const appendComputerRunEvent = async (
  taskId: string,
  event: Omit<ComputerRunEvent, "createdAt">,
): Promise<void> => {
  await getConvexClient().mutation(api.computerRuns.appendEvent, {
    secret: getBridgeSecret(),
    taskId,
    ...event,
  });
};

export const completeComputerRun = async (input: {
  taskId: string;
  resultSummary: string;
  recordingPath?: string;
  step: number;
}): Promise<void> => {
  await getConvexClient().mutation(api.computerRuns.complete, {
    secret: getBridgeSecret(),
    ...input,
  });
};

export const failComputerRun = async (input: {
  taskId: string;
  error: string;
  awaitingApproval?: boolean;
}): Promise<void> => {
  await getConvexClient().mutation(api.computerRuns.fail, {
    secret: getBridgeSecret(),
    ...input,
  });
};

export const cancelActiveComputerRunsForSpace = async (input: {
  spaceId: string;
  error: string;
  exceptTaskId?: string;
}): Promise<number> => {
  return await getConvexClient().mutation(api.computerRuns.cancelActiveForSpace, {
    secret: getBridgeSecret(),
    ...input,
  });
};

export const getComputerRun = async (
  taskId: string,
): Promise<ComputerRunStatus | null> => {
  return await getConvexClient().query(api.computerRuns.getByTaskId, {
    secret: getBridgeSecret(),
    taskId,
  });
};

export const getLatestComputerRunForSpace = async (
  spaceId: string,
): Promise<ComputerRunStatus | null> => {
  return await getConvexClient().query(api.computerRuns.latestForSpace, {
    secret: getBridgeSecret(),
    spaceId,
  });
};

export const getComputerViewerSnapshot = async (
  taskId: string,
  viewerToken: string,
): Promise<ComputerViewerSnapshot | null> => {
  return await getConvexClient().query(api.computerRuns.getViewerSnapshot, {
    secret: getBridgeSecret(),
    taskId,
    viewerToken,
  });
};
