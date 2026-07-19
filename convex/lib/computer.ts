import { v } from "convex/values";

export const computerRunState = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("awaiting_approval"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const computerActionType = v.union(
  v.literal("click"),
  v.literal("double_click"),
  v.literal("move"),
  v.literal("scroll"),
  v.literal("type"),
  v.literal("keypress"),
  v.literal("drag"),
  v.literal("wait"),
  v.literal("screenshot"),
);

export const computerRunEventResult = v.object({
  sequence: v.number(),
  step: v.number(),
  actionType: computerActionType,
  label: v.string(),
  x: v.optional(v.number()),
  y: v.optional(v.number()),
  detail: v.optional(v.string()),
  createdAt: v.number(),
});

export const computerRunStatusResult = v.object({
  taskId: v.string(),
  goal: v.string(),
  state: computerRunState,
  phase: v.string(),
  step: v.number(),
  liveViewUrl: v.optional(v.string()),
  resultSummary: v.optional(v.string()),
  recordingPath: v.optional(v.string()),
  error: v.optional(v.string()),
  createdAt: v.number(),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  heartbeatAt: v.optional(v.number()),
  lastAction: v.optional(v.string()),
});

export const computerViewerSnapshotResult = v.object({
  run: computerRunStatusResult,
  streamUrl: v.string(),
  events: v.array(computerRunEventResult),
});
