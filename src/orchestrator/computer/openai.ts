import { z } from "zod";

import { API_KEY, GMI_CLOUD_API_KEY } from "../utils/constants";

import {
  COMPUTER_COMPACTION_THRESHOLD,
  COMPUTER_DISPLAY_SIZE,
  COMPUTER_MAXIMUM_STEPS,
  COMPUTER_MODEL,
} from "./constants";
import {
  captureStableDesktopScreenshot,
  executeComputerAction,
} from "./desktop";
import { computerActionSchema } from "./types";

import type {
  ComputerAction,
  ComputerActionEvent,
  ComputerCall,
  ComputerCallCandidate,
  ComputerRequestInput,
  ExecuteComputerCallsInput,
  ExecuteComputerCallsResult,
  OpenAiComputerResponse,
  RunComputerUseInput,
  RunComputerUseResult,
} from "./types";

const computerCallSchema = z.object({
  type: z.literal("computer_call"),
  call_id: z.string(),
  actions: z.array(computerActionSchema).nullish(),
  // Legacy computer-use-preview shape (single action).
  action: computerActionSchema.nullish(),
  pending_safety_checks: z.array(z.unknown()).nullish(),
});

const responseSchema = z.object({
  id: z.string(),
  output: z.array(z.unknown()),
  output_text: z.string().optional(),
});

const messageOutputSchema = z.object({
  type: z.literal("message"),
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    }),
  ),
});

const buildInstructions = (width: number, height: number): string =>
  [
    "Operate the supplied Linux XFCE desktop using only the computer tool.",
    `The fixed display size is ${width}x${height}.`,
    "Google Chrome is already launched at task start on about:blank. Always use that Chrome window — never Firefox, never another browser, never skip opening a URL in Chrome.",
    "If Chrome is somehow not visible, open Google Chrome (google-chrome) from the dock or applications menu before doing anything else.",
    "You must visually inspect the desktop via screenshots and perform real mouse/keyboard actions.",
    "Never claim the goal is complete without interacting with the UI.",
    "Work toward the user's goal, verify the result visually, and only then stop with a concrete written result.",
    "Write that final result as plain iMessage text only: never Markdown, never **bold**, never *italics*, never backticks.",
    "Example: The answer was CHURN, solved in 4 guesses. Not: The answer was **CHURN**.",
    "Do not make purchases, send messages, publish content, enter credentials, change permissions, or delete data.",
  ].join(" ");

const screenshotDataUrl = (screenshot: Uint8Array): string =>
  `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`;

const createInitialInput = async (goal: string): Promise<unknown[]> => {
  const screenshot = await captureStableDesktopScreenshot();
  return [
    {
      role: "user",
      content: [
        { type: "input_text", text: goal },
        {
          type: "input_image",
          image_url: screenshotDataUrl(screenshot),
          detail: "original",
        },
      ],
    },
  ];
};

const createToolNudgeInput = (): unknown[] => [
  {
    role: "user",
    content: [
      {
        type: "input_text",
        text:
          "You have not used the computer tool yet. Take a screenshot and complete the goal with real clicks/typing. " +
          "Do not claim success without interacting with the desktop.",
      },
    ],
  },
];

const buildRequestBody = (
  input: ComputerRequestInput,
): Record<string, unknown> => ({
  model: COMPUTER_MODEL,
  tools: [{ type: "computer" }],
  instructions: input.instructions,
  reasoning: { effort: "low" },
  input: input.modelInput,
  prompt_cache_key: `computer-session:${input.sessionId}`,
  context_management: [
    {
      type: "compaction",
      compact_threshold: COMPUTER_COMPACTION_THRESHOLD,
    },
  ],
  ...(input.previousResponseId
    ? { previous_response_id: input.previousResponseId }
    : {}),
});

const callGmi = async (
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<OpenAiComputerResponse> => {
  if (!API_KEY) throw new Error("Missing GMI_CLOUD_API_KEY. Add it to your local .env before assigning computer tasks.");

  const response = await fetch(`${GMI_CLOUD_API_KEY}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 2_000);
    throw new Error(
      `GMI computer-use request failed (${response.status}): ${details}`,
    );
  }

  return responseSchema.parse(await response.json());
};

const normalizeComputerCall = (
  call: z.infer<typeof computerCallSchema>,
): ComputerCall => ({
  callId: call.call_id,
  actions: call.actions ?? (call.action ? [call.action] : []),
  pendingSafetyChecks: call.pending_safety_checks ?? undefined,
});

const isComputerCall = (
  item: unknown,
): item is ComputerCallCandidate =>
  Boolean(
    item &&
      typeof item === "object" &&
      "type" in item &&
      item.type === "computer_call",
  );

const parseComputerCalls = (
  output: unknown[],
  step: number,
): ComputerCall[] => {
  const calls: ComputerCall[] = [];
  let failure: string | undefined;

  for (const item of output) {
    const parsed = computerCallSchema.safeParse(item);
    if (parsed.success) {
      calls.push(normalizeComputerCall(parsed.data));
      continue;
    }

    if (!isComputerCall(item)) continue;
    failure ??= parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .slice(0, 6)
      .join("; ");
  }

  if (calls.length === 0 && failure) throw new Error(
    `Computer model returned an unreadable computer_call at step ${step}: ${failure}`,
  );

  return calls;
};

const extractResponseText = (
  output: unknown[],
  directText?: string,
): string => {
  if (directText?.trim()) return directText.trim();

  const parts: string[] = [];
  for (const item of output) {
    const parsed = messageOutputSchema.safeParse(item);
    if (!parsed.success) continue;

    for (const content of parsed.data.content) if (content.type === "output_text" && content.text?.trim()) parts.push(content.text.trim());

  }

  return parts.join("\n");
};

const summarizeActions = (actions: ComputerAction[]): string => {
  if (actions.length === 0) return "observing desktop";

  const labels = actions.map((action) => action.type);
  if (labels.length <= 3) return labels.join(", ");

  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
};

const getScrollDirection = (
  vertical: number,
  horizontal: number,
): "up" | "down" | "left" | "right" => {
  if (Math.abs(vertical) >= Math.abs(horizontal)) return vertical < 0 ? "up" : "down";

  return horizontal < 0 ? "left" : "right";
};

const describeAction = (
  action: ComputerAction,
): Omit<ComputerActionEvent, "sequence" | "step" | "action"> => {
  switch (action.type) {
    case "click":
    case "double_click":
      return {
        label: action.type === "click" ? "Clicked" : "Double-clicked",
        x: action.x,
        y: action.y,
        detail:
          action.button && action.button !== "left"
            ? `${action.button} button`
            : undefined,
      };
    case "move":
      return { label: "Moved pointer", x: action.x, y: action.y };
    case "scroll": {
      const vertical = action.scrollY ?? action.scroll_y ?? 0;
      const horizontal = action.scrollX ?? action.scroll_x ?? 0;
      return {
        label: `Scrolled ${getScrollDirection(vertical, horizontal)}`,
        x: action.x,
        y: action.y,
      };
    }
    case "type":
      return {
        label: "Typed text",
        detail: `[typed ${action.text.length} character${action.text.length === 1 ? "" : "s"}]`,
      };
    case "keypress":
      return { label: "Pressed keys", detail: action.keys.join(" + ") };
    case "drag": {
      const first = action.path[0];
      const last = action.path.at(-1);
      return {
        label: "Dragged pointer",
        x: first?.x,
        y: first?.y,
        detail: last
          ? `to ${Math.round(last.x)}, ${Math.round(last.y)}`
          : undefined,
      };
    }
    case "wait":
      return { label: "Waited for the screen" };
    case "screenshot":
      return { label: "Checked the screen" };
    default: {
      const exhaustive: never = action;
      throw new Error(
        `Unsupported computer action: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
};

const createScreenshotOutput = async (
  call: ComputerCall,
): Promise<unknown> => {
  const screenshot = await captureStableDesktopScreenshot();
  return {
    type: "computer_call_output",
    call_id: call.callId,
    output: {
      type: "computer_screenshot",
      image_url: screenshotDataUrl(screenshot),
      detail: "original",
    },
    ...(call.pendingSafetyChecks && call.pendingSafetyChecks.length > 0
      ? { acknowledged_safety_checks: call.pendingSafetyChecks }
      : {}),
  };
};

const isDesktopAction = (action: ComputerAction): boolean =>
  action.type !== "screenshot" && action.type !== "wait";

const executeCalls = async ({
  calls,
  step,
  actionSequence,
  signal,
  onProgress,
  onAction,
}: ExecuteComputerCallsInput): Promise<ExecuteComputerCallsResult> => {
  const outputs: unknown[] = [];
  let sequence = actionSequence;
  let desktopActionsTaken = 0;

  for (const call of calls) {
    await onProgress?.({
      step,
      lastAction: summarizeActions(call.actions),
    });

    for (const action of call.actions) {
      signal?.throwIfAborted();
      sequence += 1;
      await onAction?.({
        sequence,
        step,
        action,
        ...describeAction(action),
      });
      if (isDesktopAction(action)) desktopActionsTaken += 1;
      await executeComputerAction(action);
    }

    // Auto-ack any model pending_safety_checks so the loop never pauses for approval.
    outputs.push(await createScreenshotOutput(call));
  }

  return {
    outputs,
    actionSequence: sequence,
    desktopActionsTaken,
  };
};

const describeOutputTypes = (output: unknown[]): string =>
  output
    .map((item) =>
      item && typeof item === "object" && "type" in item
        ? String(item.type)
        : typeof item,
    )
    .join(",");

const createTextResult = (
  summary: string,
  step: number,
): RunComputerUseResult => {
  const steps = step - 1;
  return {
    summary:
      summary ||
      (steps <= 1
        ? "Looked at the desktop once but did not finish the requested goal."
        : "Computer task ended without a written result."),
    steps,
  };
};

export const runComputerUse = async ({
  goal,
  sessionId,
  signal,
  onProgress,
  onAction,
}: RunComputerUseInput): Promise<RunComputerUseResult> => {
  const { width, height } = COMPUTER_DISPLAY_SIZE;
  const instructions = buildInstructions(width, height);
  const maximumSteps = COMPUTER_MAXIMUM_STEPS;

  // Seed the first turn with a live screenshot so the model can act immediately
  // instead of text-only "Computer task completed" replies with no computer_call.
  let modelInput = await createInitialInput(goal);
  let previousResponseId: string | undefined;
  let actionSequence = 0;
  let desktopActionsTaken = 0;
  let sentToolNudge = false;

  for (let step = 1; step <= maximumSteps; step += 1) {
    signal?.throwIfAborted();

    const response = await callGmi(
      buildRequestBody({
        sessionId,
        instructions,
        modelInput,
        previousResponseId,
      }),
      signal,
    );
    const calls = parseComputerCalls(response.output, step);

    if (calls.length === 0) {
      const summary = extractResponseText(response.output, response.output_text);
      const result = createTextResult(summary, step);
      if (desktopActionsTaken > 0) return result;

      if (!sentToolNudge) {
        sentToolNudge = true;
        previousResponseId = response.id;
        modelInput = createToolNudgeInput();
        continue;
      }

      throw new Error(
        "Computer model stopped without any desktop actions. " +
          `outputTypes=[${describeOutputTypes(response.output)}] ` +
          `summary=${(summary || "(empty)").slice(0, 200)}`,
      );
    }

    const execution = await executeCalls({
      calls,
      step,
      actionSequence,
      signal,
      onProgress,
      onAction,
    });
    actionSequence = execution.actionSequence;
    desktopActionsTaken += execution.desktopActionsTaken;
    previousResponseId = response.id;
    modelInput = execution.outputs;
  }

  throw new Error(`Computer task exceeded ${maximumSteps} model steps`);
};
