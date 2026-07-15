import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { assertBridgeSecret } from "./lib/bridge";

const messageInput = v.object({
  role: v.string(),
  searchText: v.string(),
  payloadJson: v.string(),
  createdAt: v.optional(v.number()),
});

const messageDoc = v.object({
  role: v.string(),
  searchText: v.string(),
  payloadJson: v.string(),
  createdAt: v.number(),
});

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

export const replaceWindow = mutation({
  args: {
    secret: v.string(),
    spaceId: v.string(),
    messages: v.array(messageInput),
    keep: v.number(),
  },
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);

    const keep = Math.max(1, Math.min(args.keep, 100));
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_space_created", (q) => q.eq("spaceId", args.spaceId))
      .collect();

    for (const row of existing) {
      await ctx.db.delete("messages", row._id);
    }

    const toInsert = args.messages.slice(-keep);
    const baseTime = Date.now();
    for (const [i, msg] of toInsert.entries()) {
      await ctx.db.insert("messages", {
        spaceId: args.spaceId,
        role: msg.role,
        searchText: msg.searchText,
        payloadJson: msg.payloadJson,
        createdAt: msg.createdAt ?? baseTime + i,
      });
    }

    return { count: toInsert.length };
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

    const all = await ctx.db
      .query("messages")
      .withIndex("by_space_created", (q) => q.eq("spaceId", args.spaceId))
      .order("asc")
      .collect();

    const overflow = all.length - keep;
    if (overflow > 0) {
      for (let i = 0; i < overflow; i += 1) {
        const row = all[i];
        if (row) await ctx.db.delete("messages", row._id);
      }
    }

    return { count: args.messages.length };
  },
});
