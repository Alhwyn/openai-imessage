import { api } from "../../../convex/_generated/api";

import { getBridgeSecret, getConvexClient } from "./client";

import type { CuratedMemories, MemoryEditInput, MemoryEditResult } from "../memory/types";

export const getMemoriesForSpace = async (spaceId: string): Promise<CuratedMemories> => {
  return await getConvexClient().query(api.memories.getForSpace, {
    secret: getBridgeSecret(),
    spaceId,
  });
};

export const applyMemoryEdit = async (
  input: MemoryEditInput,
): Promise<MemoryEditResult> => {
  const edit =
    input.action === "add"
      ? { action: "add" as const, text: input.text }
      : input.action === "replace"
        ? {
          action: "replace" as const,
          oldText: input.oldText,
          text: input.text,
        }
        : { action: "remove" as const, oldText: input.oldText };

  return await getConvexClient().mutation(api.memories.applyEdit, {
    secret: getBridgeSecret(),
    spaceId: input.spaceId,
    kind: input.kind,
    edit,
  });
};
