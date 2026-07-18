import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { assertBridgeSecret } from "./lib/bridge";
import { computerRunStatusResult } from "./lib/computer";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const getRunByTaskId = async (
  ctx: QueryCtx | MutationCtx,
  taskId: string,
): Promise<Doc<"computerRuns">> => {
  const run = await ctx.db
    .query("computerRuns")
    .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
    .unique();
  if (!run) throw new Error(`Computer run not found: ${taskId}`);
  return run;
};

const getStatus = async (
  ctx: QueryCtx | MutationCtx,
  runId: Id<"computerRuns">,
) => {
  return await ctx.db
    .query("computerRunStatus")
    .withIndex("by_runId", (q) => q.eq("runId", runId))
    .unique();
};

const formatStatus = async (
  ctx: QueryCtx | MutationCtx,
  run: Doc<"computerRuns">,
) => {
  const status = await getStatus(ctx, run._id);
  return {
    taskId: run.taskId,
    goal: run.goal,
    state: run.state,
    phase: status?.phase ?? run.state,
    step: status?.step ?? 0,
    liveViewUrl: run.liveViewUrl,
    resultSummary: run.resultSummary,
    recordingPath: run.recordingPath,
    error: run.error,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    heartbeatAt: status?.heartbeatAt,
    lastAction: status?.lastAction,
  };
};

const upsertStatus = async (
  ctx: MutationCtx,
  runId: Id<"computerRuns">,
  phase: string,
  step: number,
  lastAction?: string,
): Promise<void> => {
  const existing = await getStatus(ctx, runId);
  const fields = {
    phase,
    step,
    lastAction,
    heartbeatAt: Date.now(),
  };
  if (existing) {
    await ctx.db.patch("computerRunStatus", existing._id, fields);
  } else {
    await ctx.db.insert("computerRunStatus", { runId, ...fields });
  }
};

export const create = mutation({
  args: {
    secret: v.string(),
    taskId: v.string(),
    spaceId: v.string(),
    goal: v.string(),
    liveViewUrl: v.optional(v.string()),
  },
  returns: computerRunStatusResult,
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);

    const duplicate = await ctx.db
      .query("computerRuns")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .unique();
    if (duplicate) throw new Error(`Computer run already exists: ${args.taskId}`);

    const createdAt = Date.now();
    const runId = await ctx.db.insert("computerRuns", {
      taskId: args.taskId,
      spaceId: args.spaceId,
      goal: args.goal,
      state: "queued",
      liveViewUrl: args.liveViewUrl,
      createdAt,
    });
    await upsertStatus(ctx, runId, "queued", 0);
    const run = await ctx.db.get("computerRuns", runId);
    if (!run) throw new Error("Computer run disappeared after creation");
    return await formatStatus(ctx, run);
  },
});

export const markRunning = mutation({
  args: {
    secret: v.string(),
    taskId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const run = await getRunByTaskId(ctx, args.taskId);
    if (run.state !== "queued") {
      throw new Error(`Cannot start computer run from state ${run.state}`);
    }
    await ctx.db.patch("computerRuns", run._id, {
      state: "running",
      startedAt: Date.now(),
      error: undefined,
    });
    await upsertStatus(ctx, run._id, "starting desktop", 0);
    return null;
  },
});

export const updateProgress = mutation({
  args: {
    secret: v.string(),
    taskId: v.string(),
    step: v.number(),
    lastAction: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const run = await getRunByTaskId(ctx, args.taskId);
    if (run.state !== "running") return null;
    await upsertStatus(ctx, run._id, "operating desktop", args.step, args.lastAction);
    return null;
  },
});

export const complete = mutation({
  args: {
    secret: v.string(),
    taskId: v.string(),
    resultSummary: v.string(),
    recordingPath: v.optional(v.string()),
    step: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const run = await getRunByTaskId(ctx, args.taskId);
    await ctx.db.patch("computerRuns", run._id, {
      state: "completed",
      resultSummary: args.resultSummary,
      recordingPath: args.recordingPath,
      finishedAt: Date.now(),
      error: undefined,
    });
    await upsertStatus(ctx, run._id, "completed", args.step);
    return null;
  },
});

export const fail = mutation({
  args: {
    secret: v.string(),
    taskId: v.string(),
    error: v.string(),
    awaitingApproval: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const run = await getRunByTaskId(ctx, args.taskId);
    const state = args.awaitingApproval ? "awaiting_approval" : "failed";
    await ctx.db.patch("computerRuns", run._id, {
      state,
      error: args.error,
      finishedAt: args.awaitingApproval ? undefined : Date.now(),
    });
    const status = await getStatus(ctx, run._id);
    await upsertStatus(
      ctx,
      run._id,
      args.awaitingApproval ? "awaiting approval" : "failed",
      status?.step ?? 0,
      status?.lastAction,
    );
    return null;
  },
});

export const getByTaskId = query({
  args: {
    secret: v.string(),
    taskId: v.string(),
  },
  returns: v.union(computerRunStatusResult, v.null()),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const run = await ctx.db
      .query("computerRuns")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .unique();
    return run ? await formatStatus(ctx, run) : null;
  },
});

export const latestForSpace = query({
  args: {
    secret: v.string(),
    spaceId: v.string(),
  },
  returns: v.union(computerRunStatusResult, v.null()),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const [run] = await ctx.db
      .query("computerRuns")
      .withIndex("by_spaceId_and_createdAt", (q) =>
        q.eq("spaceId", args.spaceId),
      )
      .order("desc")
      .take(1);
    return run ? await formatStatus(ctx, run) : null;
  },
});
