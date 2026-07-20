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

  let recordingStarted = false;
  try {
    await startDesktopRecording(runId);
    recordingStarted = true;
  } catch (error) {
    console.warn(
      `[computer-agent] Recording start failed; continuing without recording:`,
      error instanceof Error ? error.message : error,
    );
  }

  try {
    const result = await runComputerUse({
      goal,
      sessionId: runId,
      signal,
      onProgress,
      onAction,
    });
    const recordingPath = recordingStarted
      ? await stopDesktopRecording(runId)
      : undefined;
    return { ...result, recordingPath };
  } catch (error) {
    if (recordingStarted) await stopDesktopRecording(runId).catch(() => undefined);
    throw error;
  }
};
