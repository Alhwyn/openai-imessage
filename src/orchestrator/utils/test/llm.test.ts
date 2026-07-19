import { describe, expect, test } from "bun:test";

import {
  DEFAULT_OPENAI_TEXT_MODEL,
  OPENAI_MAX_RETRIES,
  OPENAI_PROVIDER_OPTIONS,
  OPENAI_REASONING,
} from "./constants";
import { getOpenAiErrorDetails, OPENAI_TEXT_MODEL } from "./llm";

describe("OpenAI configuration", () => {
  test("uses Terra as the default with bounded retries", () => {
    expect(DEFAULT_OPENAI_TEXT_MODEL).toBe("gpt-5.6-terra");
    expect(OPENAI_MAX_RETRIES).toBe(2);
  });

  test("keeps low-latency reasoning effort and stateless store", () => {
    expect(OPENAI_REASONING).toBe("none");
    expect(OPENAI_PROVIDER_OPTIONS).toEqual({
      openai: {
        reasoningEffort: "none",
        store: false,
      },
    });
  });

  test("extracts a nested provider status from retry errors", () => {
    const providerError = Object.assign(new Error("overloaded"), {
      statusCode: 429,
    });
    const retryError = Object.assign(new Error("retry exhausted"), {
      name: "AI_RetryError",
      lastError: providerError,
    });

    expect(getOpenAiErrorDetails(retryError)).toEqual({
      name: "AI_RetryError",
      message: "retry exhausted",
      statusCode: 429,
    });
  });

  test("uses OpenAI responses provider", () => {
    expect(OPENAI_TEXT_MODEL.provider).toBe("openai.responses");
    expect(OPENAI_TEXT_MODEL.modelId).toBe(DEFAULT_OPENAI_TEXT_MODEL);
  });

  test("explains provider key-loading failures without exposing configuration", () => {
    const error = Object.assign(new Error("OpenAI API key must be a string."), {
      name: "AI_LoadAPIKeyError",
    });

    expect(getOpenAiErrorDetails(error)).toEqual({
      name: "AI_LoadAPIKeyError",
      message: "OpenAI API key must be a string.",
      statusCode: undefined,
      guidance:
        "OPENAI_API_KEY was missing or unloaded when the provider was created. Set it before startup and restart the Bun process.",
    });
  });

  test("adds actionable guidance for rejected credentials", () => {
    const error = Object.assign(new Error("Unauthorized"), {
      name: "AI_APICallError",
      statusCode: 401,
    });

    expect(getOpenAiErrorDetails(error)).toEqual({
      name: "AI_APICallError",
      message: "Unauthorized",
      statusCode: 401,
      guidance:
        "OpenAI rejected the credential. Verify OPENAI_API_KEY is an active API key.",
    });
  });

  test("includes truncated responseBody and guidance for 400s", () => {
    const body = `${"x".repeat(2100)}tail`;
    const error = Object.assign(
      new Error("Backend request failed with status 400"),
      {
        name: "AI_APICallError",
        statusCode: 400,
        responseBody: body,
      },
    );

    const details = getOpenAiErrorDetails(error);
    expect(details).toEqual({
      name: "AI_APICallError",
      message: "Backend request failed with status 400",
      statusCode: 400,
      responseBody: `${"x".repeat(2000)}…`,
      guidance:
        "OpenAI rejected the request (inspect responseBody for schema/tool-call issues).",
    });
    expect(details.responseBody).not.toContain("tail");
  });

  test("falls back to serialized data when responseBody is missing", () => {
    const error = Object.assign(new Error("bad request"), {
      name: "AI_APICallError",
      statusCode: 400,
      data: { error: { message: "invalid tools" } },
    });

    expect(getOpenAiErrorDetails(error)).toEqual({
      name: "AI_APICallError",
      message: "bad request",
      statusCode: 400,
      responseBody: JSON.stringify({ error: { message: "invalid tools" } }),
      guidance:
        "OpenAI rejected the request (inspect responseBody for schema/tool-call issues).",
    });
  });

  test("reads responseBody from nested lastError", () => {
    const providerError = Object.assign(new Error("Backend request failed"), {
      statusCode: 400,
      responseBody: '{"detail":"bad schema"}',
    });
    const retryError = Object.assign(new Error("retry exhausted"), {
      name: "AI_RetryError",
      lastError: providerError,
    });

    expect(getOpenAiErrorDetails(retryError)).toEqual({
      name: "AI_RetryError",
      message: "retry exhausted",
      statusCode: 400,
      responseBody: '{"detail":"bad schema"}',
      guidance:
        "OpenAI rejected the request (inspect responseBody for schema/tool-call issues).",
    });
  });
});
