import {
  assertDesktopReady,
  openGoogleChrome,
  resetDesktopBrowserSession,
  resetDesktopWorkspace,
  startDesktopRecording,
  stopDesktopRecording,
} from "./desktop";
import { runComputerUse } from "./openai";

import type {
  RunComputerAgentInput,
  RunComputerAgentResult,
} from "./types";

/**
 * Run the computer agent.
 * @param input - The input for the computer agent.
 * @returns The result of the computer agent.
 */
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

  try {
    const result = await runComputerUse({
      goal,
      sessionId: runId,
      signal,
      onProgress,
      onAction,
    });
    const recordingPath = await stopDesktopRecording(runId);
    return { ...result, recordingPath };
  } catch (error) {
    await stopDesktopRecording(runId).catch(() => undefined);
    throw error;
  }
};
