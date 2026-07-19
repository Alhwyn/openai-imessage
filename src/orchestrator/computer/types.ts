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
