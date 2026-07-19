import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  memories: defineTable({
    spaceId: v.string(),
    kind: v.union(v.literal("user"), v.literal("agent")),
    body: v.string(),
    updatedAt: v.number(),
  }).index("by_space_kind", ["spaceId", "kind"]),

  messages: defineTable({
    spaceId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    searchText: v.string(),
    payloadJson: v.string(),
    createdAt: v.number(),
  }).index("by_space_created", ["spaceId", "createdAt"]),

  computerRuns: defineTable({
    taskId: v.string(),
    spaceId: v.string(),
    goal: v.string(),
    state: v.union(
      v.literal("queued"),
      v.literal("running"),
      // Legacy — no longer written; kept so old rows still validate.
      v.literal("awaiting_approval"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    /** iMessage card / custom viewer page (not raw Kasm). */
    liveViewUrl: v.optional(v.string()),
    /** Kasm stream URL embedded by the viewer iframe. */
    streamUrl: v.optional(v.string()),
    viewerToken: v.optional(v.string()),
    resultSummary: v.optional(v.string()),
    recordingPath: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_taskId", ["taskId"])
    .index("by_spaceId_and_createdAt", ["spaceId", "createdAt"])
    .index("by_state_and_createdAt", ["state", "createdAt"]),

  computerRunStatus: defineTable({
    runId: v.id("computerRuns"),
    phase: v.string(),
    step: v.number(),
    lastAction: v.optional(v.string()),
    heartbeatAt: v.number(),
  }).index("by_runId", ["runId"]),

  computerRunEvents: defineTable({
    runId: v.id("computerRuns"),
    sequence: v.number(),
    step: v.number(),
    actionType: v.union(
      v.literal("click"),
      v.literal("double_click"),
      v.literal("move"),
      v.literal("scroll"),
      v.literal("type"),
      v.literal("keypress"),
      v.literal("drag"),
      v.literal("wait"),
      v.literal("screenshot"),
    ),
    label: v.string(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_runId_and_sequence", ["runId", "sequence"]),
});

