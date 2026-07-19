import { OPENAI_API_KEY, OPENAI_BASE_URL } from "./constants/openai";

/**
 * Returns the configured OpenAI API key or throws a caller-friendly error.
 */
export const getOpenAiApiKey = (
  purpose = "OpenAI requests",
): string => {
  if (!OPENAI_API_KEY) {
    throw new Error(
      `Missing OPENAI_API_KEY. Add it to your local .env before ${purpose}.`,
    );
  }
  return OPENAI_API_KEY;
};

/**
 * Returns the OpenAI API base URL without a trailing slash.
 */
export const getOpenAiBaseUrl = (): string => OPENAI_BASE_URL;
