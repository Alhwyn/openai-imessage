import { z } from "zod";

import {
  captureStableDesktopScreenshot,
  executeComputerAction,
} from "./desktop";

import type { ComputerAction } from "./types";

const point = z.object({ x: z.number(), y: z.number() });
// Model often emits `keys: null` instead of omitting the field.
const modifierKeys = z
  .array(z.string())
  .nullish()
  .transform((value) => value ?? undefined);
const optionalNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? undefined);
const mouseButton = z
  .enum(["left", "right", "wheel", "back", "forward"])
  .nullish()
  .transform((value) => value ?? undefined);

const computerActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["click", "double_click"]),
    x: z.number(),
    y: z.number(),
    button: mouseButton,
    keys: modifierKeys,
  }),
  z.object({
    type: z.literal("move"),
    x: z.number(),
    y: z.number(),
    keys: modifierKeys,
  }),
  z.object({
    type: z.literal("scroll"),
    x: z.number(),
    y: z.number(),
    scrollX: optionalNumber,
    scrollY: optionalNumber,
    scroll_x: optionalNumber,
    scroll_y: optionalNumber,
    keys: modifierKeys,
  }),
  z.object({ type: z.literal("type"), text: z.string() }),
  z.object({ type: z.literal("keypress"), keys: z.array(z.string()) }),
  z.object({
    type: z.literal("drag"),
    path: z.array(point),
    keys: modifierKeys,
  }),
  z.object({ type: z.enum(["wait", "screenshot"]) }),
]);

const computerCallSchema = z.object({
  type: z.literal("computer_call"),
  call_id: z.string(),
  actions: z.array(computerActionSchema).nullish(),
  // Legacy computer-use-preview shape (single action).
  action: computerActionSchema.nullish(),
  pending_safety_checks: z.array(z.unknown()).nullish(),
});

const normalizeComputerCall = (
  call: z.infer<typeof computerCallSchema>,
): { call_id: string; actions: ComputerAction[]; pending_safety_checks?: unknown[] } => {
  const actions = call.actions ?? (call.action ? [call.action] : []);
  return {
    call_id: call.call_id,
    actions,
    pending_safety_checks: call.pending_safety_checks ?? undefined,
  };
};

const responseSchema = z.object({
  id: z.string(),
  output: z.array(z.unknown()),
  output_text: z.string().optional(),
});

type ComputerCall = ReturnType<typeof normalizeComputerCall>;

export class ComputerApprovalRequiredError extends Error {
  readonly checks: unknown[];

  constructor(checks: unknown[]) {
    super("The computer-use model requires human approval before continuing");
    this.name = "ComputerApprovalRequiredError";
    this.checks = checks;
  }
}

type RunComputerUseInput = {
  goal: string;
  sessionId: string;
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

type RunComputerUseResult = {
  summary: string;
  steps: number;
};

const getOpenAiApiKey = (): string => {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing OPENAI_API_KEY. Add it to your local .env before assigning computer tasks.",
    );
  }
  return key;
};

const getOpenAiBaseUrl = (): string => {
  return (
    process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") ||
    "https://api.openai.com/v1"
  );
};

const getComputerModel = (): string => {
  return process.env.OPENAI_COMPUTER_MODEL?.trim() || "gpt-5.6-terra";
};

const responseText = (output: unknown[], directText?: string): string => {
  if (directText?.trim()) return directText.trim();

  const parts: string[] = [];
  for (const item of output) {
    const parsed = z
      .object({
        type: z.literal("message"),
        content: z.array(
          z.object({
            type: z.string(),
            text: z.string().optional(),
          }),
        ),
      })
      .safeParse(item);
    if (!parsed.success) continue;
    for (const content of parsed.data.content) {
      if (content.type === "output_text" && content.text?.trim()) {
        parts.push(content.text.trim());
      }
    }
  }
  return parts.join("\n");
};

const callOpenAi = async (body: Record<string, unknown>) => {
  const response = await fetch(`${getOpenAiBaseUrl()}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${getOpenAiApiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 2_000);
    throw new Error(`OpenAI computer-use request failed (${response.status}): ${details}`);
  }

  return responseSchema.parse(await response.json());
};

const actionLabel = (actions: ComputerAction[]): string => {
  if (actions.length === 0) return "observing desktop";
  const labels = actions.map((action) => action.type);
  return labels.length > 3
    ? `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`
    : labels.join(", ");
};

const describeAction = (
  action: ComputerAction,
): { label: string; x?: number; y?: number; detail?: string } => {
  switch (action.type) {
    case "click":
    case "double_click":
      return {
        label: action.type === "click" ? "Clicked" : "Double-clicked",
        x: action.x,
        y: action.y,
        detail: action.button && action.button !== "left" ? `${action.button} button` : undefined,
      };
    case "move":
      return { label: "Moved pointer", x: action.x, y: action.y };
    case "scroll": {
      const vertical = action.scrollY ?? action.scroll_y ?? 0;
      const horizontal = action.scrollX ?? action.scroll_x ?? 0;
      const direction =
        Math.abs(vertical) >= Math.abs(horizontal)
          ? vertical < 0
            ? "up"
            : "down"
          : horizontal < 0
            ? "left"
            : "right";
      return {
        label: `Scrolled ${direction}`,
        x: action.x,
        y: action.y,
      };
    }
    case "type":
      return {
        label: "Typed text",
        detail: action.text.length > 80 ? `${action.text.slice(0, 77)}…` : action.text,
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
        detail: last ? `to ${Math.round(last.x)}, ${Math.round(last.y)}` : undefined,
      };
    }
    case "wait":
      return { label: "Waited for the screen" };
    case "screenshot":
      return { label: "Checked the screen" };
    default: {
      const exhaustive: never = action;
      throw new Error(`Unsupported computer action: ${JSON.stringify(exhaustive)}`);
    }
  }
};

const screenshotOutput = async (callId: string) => {
  const screenshot = await captureStableDesktopScreenshot();
  return {
    type: "computer_call_output",
    call_id: callId,
    output: {
      type: "computer_screenshot",
      image_url: `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`,
      detail: "original",
    },
  };
};

export const runComputerUse = async ({
  goal,
  sessionId,
  onProgress,
  onAction,
}: RunComputerUseInput): Promise<RunComputerUseResult> => {
  const maximumSteps = Math.max(
    1,
    Math.min(100, Number(process.env.COMPUTER_MAX_STEPS ?? 30)),
  );
  const { width, height } = (() => {
    const w = Number(process.env.COMPUTER_DISPLAY_WIDTH ?? 1280);
    const h = Number(process.env.COMPUTER_DISPLAY_HEIGHT ?? 800);
    return { width: w, height: h };
  })();
  const instructions =
    "Operate the supplied Linux XFCE desktop using only the computer tool. " +
    `The fixed display size is ${width}x${height}. ` +
    "For any website or browser task, open Google Chrome (google-chrome) from the dock or applications menu — prefer Chrome over Firefox. " +
    "You must visually inspect the desktop via screenshots and perform real mouse/keyboard actions. " +
    "Never claim the goal is complete without interacting with the UI. " +
    "Work toward the user's goal, verify the result visually, and only then stop with a concrete written result. " +
    "Do not make purchases, send messages, publish content, enter credentials, " +
    "change permissions, or delete data without a safety confirmation.";

  // Seed the first turn with a live screenshot so the model can act immediately
  // instead of text-only "Computer task completed" replies with no computer_call.
  const initialScreenshot = await captureStableDesktopScreenshot();
  let previousResponseId: string | undefined;
  let input: unknown[] = [
    {
      role: "user",
      content: [
        { type: "input_text", text: goal },
        {
          type: "input_image",
          image_url: `data:image/png;base64,${Buffer.from(initialScreenshot).toString("base64")}`,
          detail: "original",
        },
      ],
    },
  ];
  let desktopActionsTaken = 0;
  let textOnlyNudges = 0;
  let actionSequence = 0;

  for (let step = 1; step <= maximumSteps; step += 1) {
    const body: Record<string, unknown> = {
      model: getComputerModel(),
      tools: [{ type: "computer" }],
      instructions,
      reasoning: { effort: "low" },
      input,
      prompt_cache_key: `computer-session:${sessionId}`,
      context_management: [
        {
          type: "compaction",
          compact_threshold: Math.max(
            20_000,
            Number(process.env.COMPUTER_COMPACT_THRESHOLD ?? 60_000),
          ),
        },
      ],
    };

    if (previousResponseId) {
      body.previous_response_id = previousResponseId;
    }

    const response = await callOpenAi(body);
    const outputTypes = response.output.map((item) =>
      item && typeof item === "object" && "type" in item
        ? String(item.type)
        : typeof item,
    );
    const parseFailures: Array<{ type?: string; issues: string }> = [];
    const calls = response.output.flatMap((item): ComputerCall[] => {
      const parsed = computerCallSchema.safeParse(item);
      if (parsed.success) return [normalizeComputerCall(parsed.data)];
      if (
        item &&
        typeof item === "object" &&
        "type" in item &&
        item.type === "computer_call"
      ) {
        parseFailures.push({
          type: "computer_call",
          issues: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .slice(0, 6)
            .join("; "),
        });
      }
      return [];
    });

    if (calls.length === 0) {
      if (parseFailures.length > 0) {
        throw new Error(
          `Computer model returned an unreadable computer_call at step ${step}: ${parseFailures[0]?.issues}`,
        );
      }
      const summary = responseText(response.output, response.output_text);
      // Model sometimes replies "Computer task completed." with zero UI actions.
      // Nudge once, then fail — do not report a fake success.
      if (desktopActionsTaken === 0) {
        if (textOnlyNudges < 1) {
          textOnlyNudges += 1;
          previousResponseId = response.id;
          input = [
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
          continue;
        }
        throw new Error(
          "Computer model stopped without any desktop actions. " +
            `outputTypes=[${outputTypes.join(",")}] ` +
            `summary=${(summary || "(empty)").slice(0, 200)}`,
        );
      }
      const stepsTaken = step - 1;
      return {
        summary:
          summary ||
          (stepsTaken <= 1
            ? "Looked at the desktop once but did not finish the requested goal."
            : "Computer task ended without a written result."),
        steps: stepsTaken,
      };
    }

    const callOutputs: unknown[] = [];
    for (const call of calls) {
      const safetyChecks = call.pending_safety_checks ?? [];
      if (safetyChecks.length > 0) {
        throw new ComputerApprovalRequiredError(safetyChecks);
      }

      await onProgress?.({
        step,
        lastAction: actionLabel(call.actions),
      });

      for (const action of call.actions) {
        actionSequence += 1;
        await onAction?.({
          sequence: actionSequence,
          step,
          action,
          ...describeAction(action),
        });
        if (action.type !== "screenshot" && action.type !== "wait") {
          desktopActionsTaken += 1;
        }
        await executeComputerAction(action);
      }
      callOutputs.push(await screenshotOutput(call.call_id));
    }

    previousResponseId = response.id;
    input = callOutputs;
  }

  throw new Error(`Computer task exceeded ${maximumSteps} model steps`);
};
