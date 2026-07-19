import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { assertBridgeSecret } from "./lib/bridge";
import {
  computerActionType,
  computerRunStatusResult,
  computerViewerSnapshotResult,
} from "./lib/computer";

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
    streamUrl: v.optional(v.string()),
    viewerToken: v.optional(v.string()),
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
      streamUrl: args.streamUrl,
      viewerToken: args.viewerToken,
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
    const status = await getStatus(ctx, run._id);
    if (status && args.step < status.step) return null;
    await upsertStatus(ctx, run._id, "operating desktop", args.step, args.lastAction);
    return null;
  },
});

export const appendEvent = mutation({
  args: {
    secret: v.string(),
    taskId: v.string(),
    sequence: v.number(),
    step: v.number(),
    actionType: computerActionType,
    label: v.string(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    detail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const run = await getRunByTaskId(ctx, args.taskId);
    if (run.state !== "running") return null;
    await ctx.db.insert("computerRunEvents", {
      runId: run._id,
      sequence: args.sequence,
      step: args.step,
      actionType: args.actionType,
      label: args.label,
      x: args.x,
      y: args.y,
      detail: args.detail,
      createdAt: Date.now(),
    });
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
    if (run.state !== "running") {
      throw new Error(`Cannot complete computer run from state ${run.state}`);
    }
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
    if (
      run.state === "completed" ||
      run.state === "failed" ||
      run.state === "cancelled"
    ) {
      return null;
    }
    if (args.awaitingApproval && run.state !== "running") {
      throw new Error(
        `Cannot request approval for computer run from state ${run.state}`,
      );
    }
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

/**
 * Cancels queued/running tasks for a space so a new assign can take the desktop.
 * Orphaned workers (process restart, wedged docker exec) otherwise leave forever-running rows.
 */
export const cancelActiveForSpace = mutation({
  args: {
    secret: v.string(),
    spaceId: v.string(),
    error: v.string(),
    exceptTaskId: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const runs = await ctx.db
      .query("computerRuns")
      .withIndex("by_spaceId_and_createdAt", (q) =>
        q.eq("spaceId", args.spaceId),
      )
      .order("desc")
      .take(25);

    let cancelled = 0;
    for (const run of runs) {
      if (args.exceptTaskId && run.taskId === args.exceptTaskId) continue;
      if (
        run.state !== "queued" &&
        run.state !== "running" &&
        run.state !== "awaiting_approval"
      ) {
        continue;
      }
      await ctx.db.patch("computerRuns", run._id, {
        state: "cancelled",
        error: args.error,
        finishedAt: Date.now(),
      });
      const status = await getStatus(ctx, run._id);
      await upsertStatus(
        ctx,
        run._id,
        "cancelled",
        status?.step ?? 0,
        status?.lastAction,
      );
      cancelled += 1;
    }
    return cancelled;
  },
});

/**
 * Reconciles workers that can no longer be making progress. Passing the current
 * time during startup clears every queued/running row left by the prior process.
 * The periodic watchdog passes an older cutoff and preserves fresh heartbeats.
 */
export const reconcileStaleActive = mutation({
  args: {
    secret: v.string(),
    staleBefore: v.number(),
    error: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const states = ["queued", "running"] as const;
    let reconciled = 0;

    for (const state of states) {
      const runs = await ctx.db
        .query("computerRuns")
        .withIndex("by_state_and_createdAt", (q) =>
          q.eq("state", state).lt("createdAt", args.staleBefore),
        )
        .take(100);

      for (const run of runs) {
        const status = await getStatus(ctx, run._id);
        if (
          state === "running" &&
          status &&
          status.heartbeatAt >= args.staleBefore
        ) {
          continue;
        }
        await ctx.db.patch("computerRuns", run._id, {
          state: "failed",
          error: args.error,
          finishedAt: Date.now(),
        });
        await upsertStatus(
          ctx,
          run._id,
          "failed",
          status?.step ?? 0,
          status?.lastAction,
        );
        reconciled += 1;
      }
    }

    return reconciled;
  },
});

export const getByTaskId = query({
  args: {
    secret: v.string(),
    spaceId: v.string(),
    taskId: v.string(),
  },
  returns: v.union(computerRunStatusResult, v.null()),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const run = await ctx.db
      .query("computerRuns")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .unique();
    return run?.spaceId === args.spaceId ? await formatStatus(ctx, run) : null;
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

export const getViewerSnapshot = query({
  args: {
    secret: v.string(),
    taskId: v.string(),
    viewerToken: v.string(),
  },
  returns: v.union(computerViewerSnapshotResult, v.null()),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);
    const run = await ctx.db
      .query("computerRuns")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .unique();
    if (!run || !run.viewerToken || run.viewerToken !== args.viewerToken) {
      return null;
    }

    const events = await ctx.db
      .query("computerRunEvents")
      .withIndex("by_runId_and_sequence", (q) => q.eq("runId", run._id))
      .order("asc")
      .take(250);

    return {
      run: await formatStatus(ctx, run),
      streamUrl: run.streamUrl ?? "https://127.0.0.1:6901",
      events: events.map((event) => ({
        sequence: event.sequence,
        step: event.step,
        actionType: event.actionType,
        label: event.label,
        x: event.x,
        y: event.y,
        detail: event.detail,
        createdAt: event.createdAt,
      })),
    };
  },
});
