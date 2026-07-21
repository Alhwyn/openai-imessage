export const CLOUD_BASE_URL = "https://api.gmi-serving.com/v1";
export const API_KEY = process.env.GMI_CLOUD_API_KEY?.trim() ?? "";
export const DEFAULT_MODEL = "openai/gpt-5.6-luna" as const;
export const MODEL_ID: typeof DEFAULT_MODEL = DEFAULT_MODEL;

/** Match the reference provider's three total attempts without a minute-long silent wait. */
export const MAX_RETRIES = 2;

/**
 * Luna is a reasoning model, but GMI's prefixed ID (`openai/gpt-5.6-luna`) fails AI SDK's
 * `startsWith("gpt-5")` capability check. Force reasoning mode, keep effort none for
 * low-latency tool turns, and disable server-side store so multi-step tool continuation
 * resends encrypted reasoning instead of referencing a missing `rs_...` item.
 */
export const REASONING = "none" as const;
export const PROVIDER_OPTIONS = {
  openai: {
    forceReasoning: true,
    reasoningEffort: REASONING,
    store: false,
  },
} as const;

export const IMAGE_API_BASE = "https://console.gmicloud.ai";
export const IMAGE_MODEL_ID = "seedream-5.0-lite";
export const IMAGE_MIN_COUNT = 1;
export const IMAGE_MAX_COUNT = 3;
export const IMAGE_TIMEOUT_MS = 120_000;
export const IMAGE_POLL_INTERVAL_MS = 2_000;
export const IMAGE_SIZE = "2K";
export const IMAGE_OUTPUT_FORMAT = "jpeg" as const;
export const IMAGE_MAX_FILE_BYTES = 2 * 1_048_576;
export const IMAGE_REQUESTS_URL = `${IMAGE_API_BASE}/api/v1/ie/requestqueue/apikey/requests`;
