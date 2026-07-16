import { describe, expect, test } from "bun:test";

import {
  assertGmiApiKey,
  DEFAULT_GMI_MODEL,
  getGmiErrorDetails,
  GMI_MAX_RETRIES,
  model,
} from "./llm";

describe("GMI configuration", () => {
  test("keeps Kimi as the default with bounded retries", () => {
    expect(DEFAULT_GMI_MODEL).toBe("moonshotai/kimi-k2.7-code-highspeed");
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
    const previousApiKey = process.env.GMI_CLOUD_API_KEY;
    process.env.GMI_CLOUD_API_KEY = "test-key";

    try {
      const languageModel = model();
      expect(languageModel.provider).toBe("gmi.chat");
      expect(languageModel.modelId).toBe(DEFAULT_GMI_MODEL);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.GMI_CLOUD_API_KEY;
      } else {
        process.env.GMI_CLOUD_API_KEY = previousApiKey;
      }
    }
  });

  test("reads the API key when the model is created, not when the module is imported", () => {
    const previousApiKey = process.env.GMI_CLOUD_API_KEY;
    delete process.env.GMI_CLOUD_API_KEY;

    try {
      expect(() => assertGmiApiKey()).toThrow(
        "Missing or unloaded GMI_CLOUD_API_KEY in this Bun process",
      );

      process.env.GMI_CLOUD_API_KEY = "runtime-test-key";
      const languageModel = model();
      expect(languageModel.provider).toBe("gmi.chat");
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.GMI_CLOUD_API_KEY;
      } else {
        process.env.GMI_CLOUD_API_KEY = previousApiKey;
      }
    }
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
