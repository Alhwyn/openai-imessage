import { z } from "zod";

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

export const computerActionSchema = z.discriminatedUnion("type", [
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

export type ComputerAction = z.infer<typeof computerActionSchema>;

export type OpenAiComputerResponse = {
  id: string;
  output: unknown[];
  output_text?: string;
};

export type ComputerCall = {
  callId: string;
  actions: ComputerAction[];
  pendingSafetyChecks?: unknown[];
};

export type ComputerCallCandidate = {
  type: "computer_call";
};

export type ComputerProgress = {
  step: number;
  lastAction: string;
};

export type ComputerActionEvent = {
  sequence: number;
  step: number;
  action: ComputerAction;
  label: string;
  x?: number;
  y?: number;
  detail?: string;
};

export type RunComputerUseInput = {
  goal: string;
  sessionId: string;
  signal?: AbortSignal;
  onProgress?: (progress: ComputerProgress) => Promise<void> | void;
  onAction?: (event: ComputerActionEvent) => Promise<void> | void;
};

export type RunComputerUseResult = {
  summary: string;
  steps: number;
};

export type RunComputerAgentInput = {
  goal: string;
  runId: string;
  spaceId: string;
  signal?: AbortSignal;
  onProgress?: RunComputerUseInput["onProgress"];
  onAction?: RunComputerUseInput["onAction"];
};

export type RunComputerAgentResult = RunComputerUseResult & {
  recordingPath?: string;
};

export type ExecuteComputerCallsInput = {
  calls: ComputerCall[];
  step: number;
  actionSequence: number;
  signal?: AbortSignal;
  onProgress?: RunComputerUseInput["onProgress"];
  onAction?: RunComputerUseInput["onAction"];
};

export type ExecuteComputerCallsResult = {
  outputs: unknown[];
  actionSequence: number;
  desktopActionsTaken: number;
};

export type ComputerRequestInput = {
  sessionId: string;
  instructions: string;
  modelInput: unknown[];
  previousResponseId?: string;
};

export type ComputerRunState =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type ComputerRunStatus = {
  taskId: string;
  goal: string;
  state: ComputerRunState;
  phase: string;
  step: number;
  liveViewUrl?: string;
  resultSummary?: string;
  recordingPath?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  heartbeatAt?: number;
  lastAction?: string;
};

export type ComputerRunEvent = {
  sequence: number;
  step: number;
  actionType: ComputerAction["type"];
  label: string;
  x?: number;
  y?: number;
  detail?: string;
  createdAt: number;
};

export type ComputerViewerSnapshot = {
  run: ComputerRunStatus;
  streamUrl: string;
  events: ComputerRunEvent[];
};

export type ComputerPublicUrls = {
  kasmStreamUrl?: string;
  viewerPageUrl?: string;
};
