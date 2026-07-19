import {
  applyMemoryEdit as editMemory,
  getMemoriesForSpace as getCuratedMemories,
} from "../db/memories";

import { appendHistory, getHistory, recordAssistantText } from "./history";
import {
  MAX_HISTORY_MESSAGES,
  buildSystemPrompt,
  renderMemoryBlock,
} from "./utils";

import type {
  CuratedMemories,
  MemoryEditInput,
  MemoryEditResult,
  MemoryKind,
} from "./types";

export {
  appendHistory,
  buildSystemPrompt,
  editMemory,
  getCuratedMemories,
  getHistory,
  MAX_HISTORY_MESSAGES,
  recordAssistantText,
  renderMemoryBlock,
};
export type {
  CuratedMemories,
  MemoryEditInput,
  MemoryEditResult,
  MemoryKind,
};
