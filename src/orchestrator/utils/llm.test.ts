import { describe, expect, test } from "bun:test";

import {
  DEFAULT_GMI_MODEL,
  getGmiErrorDetails,
  GMI_MAX_RETRIES,
  model,
} from "./llm";

describe("GMI configuration", () => {
  test("uses Luna as the default with bounded retries", () => {
    expect(DEFAULT_GMI_MODEL).toBe("openai/gpt-5.6-luna");
    expect(GMI_MAX_RETRIES).toBe(2);
  });

  test("extracts a nested provider status from retry errors", () => {
    const providerError = Object.assign(new Error("overloaded"), {
      statusCode: 429,
    });
    const retryError = Object.assign(new Error("retry exhausted"), {
      name: "AI_RetryError",
      lastError: providerError,
    });

    expect(getGmiErrorDetails(retryError)).toEqual({
      name: "AI_RetryError",
      message: "retry exhausted",
      statusCode: 429,
    });
  });

  test("uses GMI's OpenAI-compatible chat completions provider", () => {
    const languageModel = model();
    expect(languageModel.provider).toBe("gmi.chat");
    expect(languageModel.modelId).toBe(DEFAULT_GMI_MODEL);
  });

  test("explains provider key-loading failures without exposing configuration", () => {
    const error = Object.assign(new Error("OpenAI API key must be a string."), {
      name: "AI_LoadAPIKeyError",
    });

    expect(getGmiErrorDetails(error)).toEqual({
      name: "AI_LoadAPIKeyError",
      message: "OpenAI API key must be a string.",
      statusCode: undefined,
      guidance:
        "GMI_CLOUD_API_KEY was missing or unloaded when the provider was created. Set it before startup and restart the Bun process.",
    });
  });

  test("adds actionable guidance for rejected credentials", () => {
    const error = Object.assign(new Error("Unauthorized"), {
      name: "AI_APICallError",
      statusCode: 401,
    });

    expect(getGmiErrorDetails(error)).toEqual({
      name: "AI_APICallError",
      message: "Unauthorized",
      statusCode: 401,
      guidance:
        "GMI rejected the credential. Verify GMI_CLOUD_API_KEY is an active GMI inference API key.",
    });
  });
});
