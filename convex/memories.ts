import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { assertBridgeSecret, charLimitForKind } from "./lib/bridge";
import { applyMemoryEditBody } from "./lib/memoryEdits";

import type { MutationCtx, QueryCtx } from "./_generated/server";

/** Machine-only API: ORCHESTRATOR_BRIDGE_SECRET is the sole gate (not for browser clients). */

const memoryKind = v.union(v.literal("user"), v.literal("agent"));

const memoryDoc = v.object({
  kind: memoryKind,
  body: v.string(),
  updatedAt: v.number(),
});

const memoryEdit = v.union(
  v.object({
    action: v.literal("add"),
    text: v.string(),
  }),
  v.object({
    action: v.literal("replace"),
    oldText: v.string(),
    text: v.string(),
  }),
  v.object({
    action: v.literal("remove"),
    oldText: v.string(),
  }),
);

/**
 * Loads the single memory row for a space/kind pair.
 * Throws if duplicates exist (.unique invariant).
 */
const getMemoryRow = async (
  ctx: QueryCtx | MutationCtx,
  spaceId: string,
  kind: "user" | "agent",
) => {
  return await ctx.db
    .query("memories")
    .withIndex("by_space_kind", (q) => q.eq("spaceId", spaceId).eq("kind", kind))
    .unique();
};

export const getForSpace = query({
  args: {
    secret: v.string(),
    spaceId: v.string(),
  },
  returns: v.object({
    user: v.string(),
    agent: v.string(),
  }),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);

    const [userRow, agentRow] = await Promise.all([
      getMemoryRow(ctx, args.spaceId, "user"),
      getMemoryRow(ctx, args.spaceId, "agent"),
    ]);

    return {
      user: userRow?.body ?? "",
      agent: agentRow?.body ?? "",
    };
  },
});

export const applyEdit = mutation({
  args: {
    secret: v.string(),
    spaceId: v.string(),
    kind: memoryKind,
    edit: memoryEdit,
  },
  returns: memoryDoc,
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);

    const limit = charLimitForKind(args.kind);
    const existing = await getMemoryRow(ctx, args.spaceId, args.kind);
    const nextBody = applyMemoryEditBody(existing?.body ?? "", args.edit, limit);
    const updatedAt = Date.now();

    if (existing) {
      await ctx.db.patch("memories", existing._id, { body: nextBody, updatedAt });
    } else {
      await ctx.db.insert("memories", {
        spaceId: args.spaceId,
        kind: args.kind,
        body: nextBody,
        updatedAt,
      });
    }

    return { kind: args.kind, body: nextBody, updatedAt };
  },
});
