import type { ComputerRunStatus } from "./types";

/** Strip Markdown emphasis so iMessage never shows **bold** / *italics*. */
export const stripMarkdownEmphasis = (text: string): string =>
  text
    .replace(/\*\*(.+?)\*\*/gu, "$1")
    .replace(/(?<!\w)\*(.+?)\*(?!\w)/gu, "$1")
    .replace(/(?<!\w)_(.+?)_(?!\w)/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1");

/**
 * Formats the latest computer-run for the interaction system prompt so the
 * chat agent always knows whether the desktop task finished, failed, or stalled.
 */
export const formatComputerRunContext = (
  run: ComputerRunStatus | null | undefined,
): string => {
  if (!run) return "";

  const lines = [
    "<latest_computer_task>",
    `state: ${run.state}`,
    `taskId: ${run.taskId}`,
    `goal: ${run.goal}`,
    `step: ${run.step}`,
    `phase: ${run.phase}`,
  ];
  if (run.lastAction) lines.push(`lastAction: ${run.lastAction}`);
  if (run.liveViewUrl) lines.push(`liveViewUrl: ${run.liveViewUrl}`);
  if (run.resultSummary) lines.push(`resultSummary: ${run.resultSummary}`);
  if (run.error) lines.push(`error: ${run.error}`);
  if (run.finishedAt) lines.push(`finishedAt: ${run.finishedAt}`);
  const ageMs = Date.now() - run.createdAt;
  if (
    (run.state === "running" || run.state === "queued") &&
    run.step === 0 &&
    ageMs > 90_000
  ) {
    lines.push(
      `note: this run looks stuck (no desktop actions after ${Math.round(ageMs / 1000)}s). If the person asks again to do the task, call assign_computer_task to start a fresh run.`,
    );
  }
  lines.push(
    "Use this as ground truth for computer/browser/desktop outcomes. If state is failed/cancelled, or resultSummary is empty/vague, do not claim the task succeeded. Call get_computer_task_status when the person asks what happened.",
  );
  lines.push("</latest_computer_task>");
  return lines.join("\n");
};

/**
 * User-facing / history text after a computer worker finishes.
 */
export const formatComputerDeliveryText = (input: {
  goal: string;
  summary: string;
  steps: number;
  lastAction?: string;
}): string => {
  const summary = stripMarkdownEmphasis(input.summary.trim());
  const looksVague =
    !summary ||
    input.steps <= 0 ||
    /^computer task completed\.?$/i.test(summary) ||
    summary.length < 12;

  if (looksVague) {
    const action = input.lastAction ? ` last saw: ${input.lastAction}.` : "";
    return (
      `computer looked at the desktop for "${input.goal}" ` +
      `(${input.steps} step${input.steps === 1 ? "" : "s"}) but did not finish it.${action} ` +
      `ask me to try again or check the live view`
    );
  }

  return summary;
};

/**
 * User-facing / history text after a computer worker fails.
 */
export const formatComputerFailureText = (input: {
  goal: string;
  error: string;
}): string => {
  const error = input.error.trim().slice(0, 280);
  return `couldnt finish the computer task ("${input.goal}"): ${error}`;
};
