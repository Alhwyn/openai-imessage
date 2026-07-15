import { api } from "../../../convex/_generated/api";

import { getBridgeSecret, getConvexClient } from "./client";

import type { MemoryEditResult } from "./types";
import type { CuratedMemories, MemoryEditInput } from "../memory/types";

export const getMemoriesForSpace = async (spaceId: string): Promise<CuratedMemories> => {
  return await getConvexClient().query(api.memories.getForSpace, {
    secret: getBridgeSecret(),
    spaceId,
  });
};

export const applyMemoryEdit = async (input: MemoryEditInput): Promise<MemoryEditResult> => {
  return await getConvexClient().mutation(api.memories.applyEdit, {
    secret: getBridgeSecret(),
    spaceId: input.spaceId,
    kind: input.kind,
    action: input.action,
    text: input.text,
    oldText: input.oldText,
  });
};
