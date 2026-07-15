import { api } from "../../../convex/_generated/api";

import { getBridgeSecret, getConvexClient } from "./client";

export type MemoryKind = "user" | "agent";

export type MemoryEditAction = "add" | "replace" | "remove";

export type CuratedMemories = {
  user: string;
  agent: string;
};

export type MemoryEditResult = {
  kind: MemoryKind;
  body: string;
  updatedAt: number;
};

export const getMemoriesForSpace = async (spaceId: string): Promise<CuratedMemories> => {
  return await getConvexClient().query(api.memories.getForSpace, {
    secret: getBridgeSecret(),
    spaceId,
  });
};

export const applyMemoryEdit = async (input: {
  spaceId: string;
  kind: MemoryKind;
  action: MemoryEditAction;
  text?: string;
  oldText?: string;
}): Promise<MemoryEditResult> => {
  return await getConvexClient().mutation(api.memories.applyEdit, {
    secret: getBridgeSecret(),
    spaceId: input.spaceId,
    kind: input.kind,
    action: input.action,
    text: input.text,
    oldText: input.oldText,
  });
};
