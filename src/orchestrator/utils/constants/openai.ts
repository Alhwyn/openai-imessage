export const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export const DEFAULT_OPENAI_TEXT_MODEL = "gpt-5.6-terra";
export const OPENAI_TEXT_MODEL_ID = DEFAULT_OPENAI_TEXT_MODEL;

/** Match the previous provider's three total attempts without a long silent wait. */
export const OPENAI_MAX_RETRIES = 2;

/**
 * Keep effort none for low-latency tool turns, and disable server-side store so
 * multi-step tool continuation resends encrypted reasoning instead of referencing
 * a missing `rs_...` item.
 */
export const OPENAI_REASONING = "none" as const;
export const OPENAI_PROVIDER_OPTIONS = {
  openai: {
    reasoningEffort: OPENAI_REASONING,
    store: false,
  },
} as const;

export const OPENAI_IMAGE_MODEL_ID = "gpt-image-2";
export const IMAGE_MIN_COUNT = 1;
export const IMAGE_MAX_COUNT = 3;
export const OPENAI_IMAGE_TIMEOUT_MS = 120_000;
export const OPENAI_IMAGE_SIZE = "1280x1280";
export const OPENAI_IMAGE_OUTPUT_FORMAT = "jpeg" as const;
export const OPENAI_IMAGE_QUALITY = "medium" as const;
export const OPENAI_IMAGE_OUTPUT_COMPRESSION = 80;
export const IMAGE_MAX_FILE_BYTES = 2 * 1_048_576;
