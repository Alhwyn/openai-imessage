import { runInteractionAgent } from "./agents/index";
import {
  buildDebouncedTurn,
  flushPendingOrchestratorTurns,
  scheduleOrchestratorTurn,
} from "./bounce/index";
import { assertConvexEnv, reconcileStaleComputerRuns } from "./db/index";
import { assignImageTask, assignTask } from "./handoff/index";
import {
  assertOpenAiApiKey,
  createRecentIdTracker,
  extractInboundImages,
  extractInboundText,
  OPENAI_TEXT_MODEL,
  SEEN_MESSAGE_MAX,
  SEEN_MESSAGE_TTL_MS,
} from "./utils/index";
import { runExecutionAgent } from "./workers/execution";

import type {
  InboundImage,
  InteractionEvent,
  InteractionResult,
  OutboundItem,
  TapbackKey,
} from "./agents/index";
import type { OrchestratorTurn } from "./bounce/index";
import type { RecentIdTracker, RecentIdTrackerOptions } from "./utils/index";

export {
  assertConvexEnv,
  assertOpenAiApiKey,
  assignImageTask,
  assignTask,
  buildDebouncedTurn,
  createRecentIdTracker,
  extractInboundImages,
  extractInboundText,
  flushPendingOrchestratorTurns,
  OPENAI_TEXT_MODEL,
  reconcileStaleComputerRuns,
  runExecutionAgent,
  runInteractionAgent,
  scheduleOrchestratorTurn,
  SEEN_MESSAGE_MAX,
  SEEN_MESSAGE_TTL_MS,
};
export type {
  InboundImage,
  InteractionEvent,
  InteractionResult,
  OrchestratorTurn,
  OutboundItem,
  RecentIdTracker,
  RecentIdTrackerOptions,
  TapbackKey,
};
