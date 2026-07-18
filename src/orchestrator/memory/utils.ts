import type { CuratedMemories } from "./types";

export const MAX_HISTORY_MESSAGES = 40;

/**
 * Renders a memory block.
 * @param memories - The memories to render.
 * @returns The rendered memory block.
 */
export const renderMemoryBlock = (memories: CuratedMemories): string => {
  const sections: string[] = [];

  if (memories.user.trim()) sections.push(`## USER.md\n${memories.user.trim()}`);

  if (memories.agent.trim()) sections.push(`## MEMORY.md\n${memories.agent.trim()}`);

  if (sections.length === 0) return "";

  return [
    "# Persistent memory (frozen for this turn)",
    "Facts below persist across sessions. Update them with the memory tool when the person shares durable preferences or when you learn lasting conventions.",
    "",
    ...sections,
  ].join("\n");
};

/**
 * Builds a system prompt.
 * @param basePrompt - The base prompt.
 * @param memories - The memories to build the system prompt.
 * @returns The system prompt.
 */
export const buildSystemPrompt = (basePrompt: string, memories: CuratedMemories): string => {
  const block = renderMemoryBlock(memories);
  if (!block) return basePrompt;
  return `${basePrompt.trim()}\n\n${block}`;
};
