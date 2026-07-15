import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { assertBridgeSecret, charLimitForKind } from "./lib/bridge";

const memoryKind = v.union(v.literal("user"), v.literal("agent"));

const memoryDoc = v.object({
  kind: memoryKind,
  body: v.string(),
  updatedAt: v.number(),
});

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

    const rows = await ctx.db
      .query("memories")
      .withIndex("by_space_kind", (q) => q.eq("spaceId", args.spaceId))
      .collect();

    let user = "";
    let agent = "";
    for (const row of rows) {
      if (row.kind === "user") user = row.body;
      if (row.kind === "agent") agent = row.body;
    }

    return { user, agent };
  },
});

const applyAdd = (body: string, text: string, limit: number): string => {
  const entry = text.trim();
  if (!entry) return body;
  if (body.includes(entry)) return body;

  const next = body ? `${body}\n${entry}` : entry;

  if (next.length > limit) throw new Error(`Memory exceeds ${limit} character limit`);

  return next;
};

const applyReplace = (body: string, oldText: string, newText: string, limit: number): string => {

  if (!oldText || !body.includes(oldText)) throw new Error("old_text not found in memory");

  const next = body.replace(oldText, newText);

  if (next.length > limit) throw new Error(`Memory exceeds ${limit} character limit`);

  return next;
};

const applyRemove = (body: string, oldText: string): string => {

  if (!oldText || !body.includes(oldText)) throw new Error("old_text not found in memory");
  
  return body.replaceAll(oldText, "").replace(/\n{3,}/g, "\n\n").trim();
};

export const applyEdit = mutation({
  args: {
    secret: v.string(),
    spaceId: v.string(),
    kind: memoryKind,
    action: v.union(v.literal("add"), v.literal("replace"), v.literal("remove")),
    text: v.optional(v.string()),
    oldText: v.optional(v.string()),
  },
  returns: memoryDoc,
  handler: async (ctx, args) => {
    assertBridgeSecret(args.secret);

    const limit = charLimitForKind(args.kind);
    const existing = await ctx.db
      .query("memories")
      .withIndex("by_space_kind", (q) =>
        q.eq("spaceId", args.spaceId).eq("kind", args.kind),
      )
      .unique();

    const currentBody = existing?.body ?? "";
    let nextBody = currentBody;

    switch (args.action) {
      case "add": {
        if (!args.text?.trim()) throw new Error("text is required for add");
        nextBody = applyAdd(currentBody, args.text, limit);
        break;
      }
      case "replace": {
        if (!args.oldText) throw new Error("oldText is required for replace");
        if (args.text === undefined) throw new Error("text is required for replace");
        nextBody = applyReplace(currentBody, args.oldText, args.text, limit);
        break;
      }
      case "remove": {
        if (!args.oldText) throw new Error("oldText is required for remove");
        nextBody = applyRemove(currentBody, args.oldText);
        break;
      }
      default: {
        const _exhaustive: never = args.action;
        throw new Error(`Unknown action: ${String(_exhaustive)}`);
      }
    }

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
