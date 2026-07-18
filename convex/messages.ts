import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { assertBridgeSecret } from "./lib/bridge";
import {
  getMessagePruneBatch,
  MESSAGE_PRUNE_BATCH_SIZE,
} from "./lib/messageRetention";

import type { MutationCtx } from "./_generated/server";

/** Machine-only API: ORCHESTRATOR_BRIDGE_SECRET is the sole gate (not for browser clients). */

const messageRole = v.union(v.literal("user"), v.literal("assistant"));

const messageInput = v.object({
  role: messageRole,
  searchText: v.string(),
  payloadJson: v.string(),
  createdAt: v.optional(v.number()),
});

const messageDoc = v.object({
  role: messageRole,
  searchText: v.string(),
  payloadJson: v.string(),
  createdAt: v.number(),
});

/** Max messages accepted in one appendMany call. */
export const MESSAGE_APPEND_MAX_BATCH = 50;

const pruneMessageBatch = async (
  ctx: MutationCtx,
  spaceId: string,
  keep: number,
): Promise<boolean> => {
  const newestFirst = await ctx.db
    .query("messages")
    .withIndex("by_space_created", (q) => q.eq("spaceId", spaceId))
    .order("desc")
    .take(keep + MESSAGE_PRUNE_BATCH_SIZE + 1);
  const batch = getMessagePruneBatch(newestFirst, keep);

  for (const row of batch.rows) {
    await ctx.db.delete("messages", row._id);
  }

  return batch.hasMore;
};

const schedulePruneContinuation = async (
  ctx: MutationCtx,
  spaceId: string,
  keep: number,
): Promise<void> => {
  await ctx.scheduler.runAfter(0, internal.messages.pruneOverflow, {
    spaceId,
    keep,
  });
};

export const listRecent = query({
  args: {
    secret: v.string(),
    spaceId: v.string(),
    limit: v.number(),
  },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);

    const limit = Math.max(1, Math.min(args.limit, 100));
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_space_created", (q) => q.eq("spaceId", args.spaceId))
      .order("desc")
      .take(limit);

    return rows
      .map((row) => ({
        role: row.role,
        searchText: row.searchText,
        payloadJson: row.payloadJson,
        createdAt: row.createdAt,
      }))
      .reverse();
  },
});

export const appendMany = mutation({
  args: {
    secret: v.string(),
    spaceId: v.string(),
    messages: v.array(messageInput),
    keep: v.number(),
  },
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);

    if (args.messages.length > MESSAGE_APPEND_MAX_BATCH) {
      throw new Error(
        `messages batch exceeds ${MESSAGE_APPEND_MAX_BATCH} item limit`,
      );
    }

    const keep = Math.max(1, Math.min(args.keep, 100));
    const baseTime = Date.now();

    for (const [i, msg] of args.messages.entries()) {
      await ctx.db.insert("messages", {
        spaceId: args.spaceId,
        role: msg.role,
        searchText: msg.searchText,
        payloadJson: msg.payloadJson,
        createdAt: msg.createdAt ?? baseTime + i,
      });
    }

    const hasMore = await pruneMessageBatch(ctx, args.spaceId, keep);

    if (hasMore) await schedulePruneContinuation(ctx, args.spaceId, keep);

    return { count: args.messages.length };
  },
});

export const pruneOverflow = internalMutation({
  args: {
    spaceId: v.string(),
    keep: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const keep = Math.max(1, Math.min(args.keep, 100));
    const hasMore = await pruneMessageBatch(ctx, args.spaceId, keep);
    if (hasMore) {
      await schedulePruneContinuation(ctx, args.spaceId, keep);
    }

    return null;
  },
});
