import { v } from "convex/values";

export const computerRunState = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("awaiting_approval"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

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
