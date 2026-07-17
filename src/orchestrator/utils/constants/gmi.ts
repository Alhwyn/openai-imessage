export const GMI_CLOUD_BASE_URL = "https://api.gmi-serving.com/v1";
export const GMI_API_KEY = process.env.GMI_CLOUD_API_KEY?.trim() ?? "";
export const DEFAULT_GMI_MODEL = "openai/gpt-5.6-luna";
export const GMI_MODEL_ID = process.env.GMI_MODEL?.trim() || DEFAULT_GMI_MODEL;
/** Match the reference provider's three total attempts without a minute-long silent wait. */
export const GMI_MAX_RETRIES = 2;
export const GMI_TEMPERATURE = 1;
/**
 * Luna rejects function tools on /v1/chat/completions unless reasoning_effort is none.
 * Pass as generateText `reasoning` and mirror in providerOptions.openai.reasoningEffort.
 */
export const GMI_REASONING = "none" as const;
export const GMI_PROVIDER_OPTIONS = {
  openai: {
    reasoningEffort: GMI_REASONING,
  },
} as const;
export const GMI_IMAGE_API_BASE = "https://console.gmicloud.ai";
export const GMI_IMAGE_MODEL_ID = "seedream-5.0-lite";
export const GMI_IMAGE_MIN_COUNT = 1;
export const GMI_IMAGE_MAX_COUNT = 3;
export const GMI_IMAGE_TIMEOUT_MS = 120_000;
export const GMI_IMAGE_POLL_INTERVAL_MS = 2_000;
export const GMI_IMAGE_SIZE = "2K";
export const GMI_IMAGE_OUTPUT_FORMAT = "jpeg";
export const GMI_IMAGE_MAX_FILE_BYTES = 2 * 1_048_576;
export const GMI_IMAGE_REQUESTS_URL = `${GMI_IMAGE_API_BASE}/api/v1/ie/requestqueue/apikey/requests`;
