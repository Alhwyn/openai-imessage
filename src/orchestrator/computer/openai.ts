import { z } from "zod";

import {
  captureDesktopScreenshot,
  executeComputerAction,
} from "./desktop";

import type { ComputerAction } from "./types";

const point = z.object({ x: z.number(), y: z.number() });
const modifierKeys = z.array(z.string()).optional();

const computerActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["click", "double_click"]),
    x: z.number(),
    y: z.number(),
    button: z
      .enum(["left", "right", "wheel", "back", "forward"])
      .optional(),
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
    scrollX: z.number().optional(),
    scrollY: z.number().optional(),
    scroll_x: z.number().optional(),
    scroll_y: z.number().optional(),
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
  actions: z.array(computerActionSchema),
  pending_safety_checks: z.array(z.unknown()).optional(),
});

const responseSchema = z.object({
  id: z.string(),
  output: z.array(z.unknown()),
  output_text: z.string().optional(),
});

type ComputerCall = z.infer<typeof computerCallSchema>;

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
  onProgress?: (progress: {
    step: number;
    lastAction: string;
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

const screenshotOutput = async (callId: string) => {
  const screenshot = await captureDesktopScreenshot();
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
  onProgress,
}: RunComputerUseInput): Promise<RunComputerUseResult> => {
  const maximumSteps = Math.max(
    1,
    Math.min(100, Number(process.env.COMPUTER_MAX_STEPS ?? 30)),
  );
  const instructions =
    "Operate the supplied Linux desktop using only the computer tool. " +
    "Work toward the user's goal, verify the result visually, and stop when complete. " +
    "Do not make purchases, send messages, publish content, enter credentials, " +
    "change permissions, or delete data without a safety confirmation.";

  let previousResponseId: string | undefined;
  let input: unknown[] = [
    {
      role: "user",
      content: [{ type: "input_text", text: goal }],
    },
  ];

  for (let step = 1; step <= maximumSteps; step += 1) {
    const body: Record<string, unknown> = {
      model: getComputerModel(),
      tools: [{ type: "computer" }],
      instructions,
      reasoning: { effort: "low" },
      input,
    };

    if (previousResponseId) {
      body.previous_response_id = previousResponseId;
    }

    const response = await callOpenAi(body);
    const calls = response.output.flatMap((item): ComputerCall[] => {
      const parsed = computerCallSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });

    if (calls.length === 0) {
      return {
        summary:
          responseText(response.output, response.output_text) ||
          "Computer task completed.",
        steps: step - 1,
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
        await executeComputerAction(action);
      }
      callOutputs.push(await screenshotOutput(call.call_id));
    }

    previousResponseId = response.id;
    input = callOutputs;
  }

  throw new Error(`Computer task exceeded ${maximumSteps} model steps`);
};
