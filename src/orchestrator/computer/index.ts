import {
  assertDesktopReady,
  getComputerLiveViewUrl,
  startDesktopRecording,
  stopDesktopRecording,
} from "./desktop";
import { runComputerUse } from "./openai";

type RunComputerAgentInput = {
  goal: string;
  runId: string;
  onProgress?: (progress: {
    step: number;
    lastAction: string;
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
}: RunComputerAgentInput): Promise<RunComputerAgentResult> => {
  await assertDesktopReady();
  await startDesktopRecording(runId);

  let recordingPath: string | undefined;
  try {
    const result = await runComputerUse({ goal, onProgress });
    recordingPath = await stopDesktopRecording(runId);
    return { ...result, recordingPath };
  } catch (error) {
    await stopDesktopRecording(runId).catch(() => undefined);
    throw error;
  }
};

export { getComputerLiveViewUrl };
export { ComputerApprovalRequiredError } from "./openai";
export type {
  ComputerAction,
  ComputerRunState,
  ComputerRunStatus,
} from "./types";
