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
});

