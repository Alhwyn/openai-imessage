import {
  assertDesktopReady,
  getComputerLiveViewUrl,
  startDesktopRecording,
  stopDesktopRecording,
} from "./desktop";
import { runComputerUse } from "./openai";

import type { ComputerAction } from "./types";

type RunComputerAgentInput = {
  goal: string;
  runId: string;
  onProgress?: (progress: {
    step: number;
    lastAction: string;
  }) => Promise<void> | void;
  onAction?: (progress: {
    sequence: number;
    step: number;
    action: ComputerAction;
    label: string;
    x?: number;
    y?: number;
    detail?: string;
  }) => Promise<void> | void;
};

export type RunComputerAgentResult = {
  summary: string;
  steps: number;
  recordingPath?: string;
};

export const runComputerAgent = async ({
  goal,
  runId,
  onProgress,
  onAction,
}: RunComputerAgentInput): Promise<RunComputerAgentResult> => {
  await assertDesktopReady();
  await startDesktopRecording(runId);

  let recordingPath: string | undefined;
  try {
    const result = await runComputerUse({
      goal,
      sessionId: runId,
      onProgress,
      onAction,
    });
    recordingPath = await stopDesktopRecording(runId);
    return { ...result, recordingPath };
  } catch (error) {
    await stopDesktopRecording(runId).catch(() => undefined);
    throw error;
  }
};

export { getComputerLiveViewUrl };
export {
  getComputerViewerBaseUrl,
  getComputerViewerUrl,
  startComputerViewer,
} from "./viewer";
export { ComputerApprovalRequiredError } from "./openai";
export {
  formatComputerDeliveryText,
  formatComputerFailureText,
  formatComputerRunContext,
} from "./statusText";
export type {
  ComputerAction,
  ComputerRunState,
  ComputerRunStatus,
} from "./types";
