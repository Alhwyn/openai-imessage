import { applyMemoryEdit, getMemoriesForSpace } from "../db/index";
import type { CuratedMemories, MemoryEditInput } from "./types";

/**
 * Gets the curated memories for a space.
 * @param spaceId - The space ID.
 * @returns The user and agent memory bodies.
 */
export const getCuratedMemories = async (spaceId: string): Promise<CuratedMemories> => {
  return await getMemoriesForSpace(spaceId);
};

/**
 * Edits a memory.
 * @param input - The input to edit the memory.
 * @returns The updated memory.
 */
export const editMemory = async (input: MemoryEditInput) => {
  return await applyMemoryEdit(input);
};
