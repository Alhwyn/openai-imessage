import {
  assertDesktopReady,
  openGoogleChrome,
  resetDesktopBrowserSession,
  resetDesktopWorkspace,
  startDesktopRecording,
  stopDesktopRecording,
} from "./desktop";
import { runComputerUse } from "./openai";

import type { ComputerAction } from "./types";

type RunComputerAgentInput = {
  goal: string;
  runId: string;
  spaceId: string;
  signal?: AbortSignal;
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
  spaceId,
  signal,
  onProgress,
  onAction,
}: RunComputerAgentInput): Promise<RunComputerAgentResult> => {
  console.log(`[computer-agent] Resetting desktop for space ${spaceId}`);
  await resetDesktopBrowserSession();
  await resetDesktopWorkspace();
  await assertDesktopReady();
  await openGoogleChrome();
  await startDesktopRecording(runId);

  let recordingPath: string | undefined;
  try {
    const result = await runComputerUse({
      goal,
      sessionId: runId,
      signal,
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

export {
  getComputerViewerBaseUrl,
  resolveComputerPublicUrls,
} from "./urls";
export {
  getComputerViewerUrl,
  startComputerViewer,
} from "./viewer";
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
