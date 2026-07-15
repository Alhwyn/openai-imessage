import type { CuratedMemories } from "./types";

export const USER_MEMORY_CHAR_LIMIT = 1_375;
export const AGENT_MEMORY_CHAR_LIMIT = 2_200;
export const MAX_HISTORY_MESSAGES = 40;

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

export const buildSystemPrompt = (basePrompt: string, memories: CuratedMemories): string => {
  const block = renderMemoryBlock(memories);
  if (!block) return basePrompt;
  return `${basePrompt.trim()}\n\n${block}`;
};
