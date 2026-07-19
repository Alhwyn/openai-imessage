import { expect, test } from "bun:test";

import {
  formatComputerDeliveryText,
  formatComputerFailureText,
  formatComputerRunContext,
  stripMarkdownEmphasis,
} from "../statusText";

import type { ComputerRunStatus } from "../types";

const baseRun = (overrides: Partial<ComputerRunStatus> = {}): ComputerRunStatus => ({
  taskId: "computer_1",
  goal: "open chrome and solve wordle",
  state: "completed",
  phase: "completed",
  step: 1,
  resultSummary: "Computer task completed.",
  createdAt: 1,
  ...overrides,
});

test("formatComputerRunContext includes failure ground truth", () => {
  const text = formatComputerRunContext(
    baseRun({
      state: "failed",
      error: "screenshot failed",
      resultSummary: undefined,
    }),
  );
  expect(text).toContain("<latest_computer_task>");
  expect(text).toContain("state: failed");
  expect(text).toContain("error: screenshot failed");
  expect(text).toContain("do not claim the task succeeded");
});

test("formatComputerDeliveryText rewrites vague completed summaries", () => {
  const text = formatComputerDeliveryText({
    goal: "solve wordle",
    summary: "Computer task completed.",
    steps: 1,
    lastAction: "screenshot",
  });
  expect(text).toContain("did not finish");
  expect(text).toContain("solve wordle");
  expect(text).toContain("screenshot");
});

test("formatComputerFailureText keeps the goal and error", () => {
  const text = formatComputerFailureText({
    goal: "open chrome",
    error: "Desktop container is not running",
  });
  expect(text).toContain("open chrome");
  expect(text).toContain("Desktop container is not running");
});

test("stripMarkdownEmphasis removes bold markers", () => {
  expect(
    stripMarkdownEmphasis(
      "Solved today’s official Wordle. The answer was **CHURN**, solved in **4 guesses**.",
    ),
  ).toBe(
    "Solved today’s official Wordle. The answer was CHURN, solved in 4 guesses.",
  );
});

test("formatComputerDeliveryText strips Markdown bold from summaries", () => {
  const text = formatComputerDeliveryText({
    goal: "solve wordle",
    summary:
      "Solved today’s official Wordle. The answer was **CHURN**, solved in **4 guesses**.",
    steps: 9,
  });
  expect(text).toBe(
    "Solved today’s official Wordle. The answer was CHURN, solved in 4 guesses.",
  );
  expect(text).not.toContain("**");
});
