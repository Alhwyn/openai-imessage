import {
  DEFAULT_OPENAI_TEXT_MODEL,
  DEFAULT_ORCHESTRATOR_DEBOUNCE_MS,
  EXECUTION_AGENT_MAX_STEPS,
  IMAGE_MAX_COUNT,
  IMAGE_MAX_FILE_BYTES,
  IMAGE_MIN_COUNT,
  INTERACTION_AGENT_MAX_STEPS,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_IMAGE_MODEL_ID,
  OPENAI_IMAGE_OUTPUT_COMPRESSION,
  OPENAI_IMAGE_OUTPUT_FORMAT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
  OPENAI_IMAGE_TIMEOUT_MS,
  OPENAI_MAX_RETRIES,
  OPENAI_PROVIDER_OPTIONS,
  OPENAI_REASONING,
  OPENAI_TEXT_MODEL_ID,
  SEEN_MESSAGE_MAX,
  SEEN_MESSAGE_TTL_MS,
} from "./constants";
import { createKeyedDebounce } from "./debounce";
import { deliverOutbound } from "./deliver";
import {
  assertOpenAiApiKey,
  getOpenAiErrorDetails,
  OPENAI_TEXT_MODEL,
} from "./llm";
import { getOpenAiApiKey, getOpenAiBaseUrl } from "./openaiEnv";
import { createRecentIdTracker } from "./recentIds";
import { extractInboundImages, extractInboundText } from "./text";
import { buildUserContent } from "./userContent";

import type { OpenAiErrorDetails } from "./llm";
import type {
  DeliverOutboundOptions,
  GeneratedImageAlbum,
  GenerateImagesOptions,
  ImageGenerationProgress,
  KeyedDebounce,
  KeyedDebounceOptions,
  OpenAiImagesResponse,
  RecentIdTracker,
  RecentIdTrackerOptions,
} from "./types";

export {
  assertOpenAiApiKey,
  buildUserContent,
  createKeyedDebounce,
  createRecentIdTracker,
  DEFAULT_OPENAI_TEXT_MODEL,
  DEFAULT_ORCHESTRATOR_DEBOUNCE_MS,
  deliverOutbound,
  EXECUTION_AGENT_MAX_STEPS,
  extractInboundImages,
  extractInboundText,
  getOpenAiApiKey,
  getOpenAiBaseUrl,
  getOpenAiErrorDetails,
  IMAGE_MAX_COUNT,
  IMAGE_MAX_FILE_BYTES,
  IMAGE_MIN_COUNT,
  INTERACTION_AGENT_MAX_STEPS,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_IMAGE_MODEL_ID,
  OPENAI_IMAGE_OUTPUT_COMPRESSION,
  OPENAI_IMAGE_OUTPUT_FORMAT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
  OPENAI_IMAGE_TIMEOUT_MS,
  OPENAI_MAX_RETRIES,
  OPENAI_PROVIDER_OPTIONS,
  OPENAI_REASONING,
  OPENAI_TEXT_MODEL,
  OPENAI_TEXT_MODEL_ID,
  SEEN_MESSAGE_MAX,
  SEEN_MESSAGE_TTL_MS,
};
export type {
  DeliverOutboundOptions,
  GeneratedImageAlbum,
  GenerateImagesOptions,
  ImageGenerationProgress,
  KeyedDebounce,
  KeyedDebounceOptions,
  OpenAiErrorDetails,
  OpenAiImagesResponse,
  RecentIdTracker,
  RecentIdTrackerOptions,
};
