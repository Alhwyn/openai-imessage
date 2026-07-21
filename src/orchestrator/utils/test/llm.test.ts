import { describe, expect, test } from "bun:test";

import {
  DEFAULT_MODEL,
  MAX_RETRIES,
  PROVIDER_OPTIONS,
  REASONING,
} from "../constants";
import { getGmiErrorDetails, MODEL } from "../llm";

describe("GMI configuration", () => {
  test("uses Luna as the default with bounded retries", () => {
    expect(DEFAULT_MODEL).toBe("openai/gpt-5.6-luna");
    expect(MAX_RETRIES).toBe(2);
  });

  test("forces Luna reasoning mode with none effort and stateless store", () => {
    expect(REASONING).toBe("none");
    expect(PROVIDER_OPTIONS).toEqual({
      openai: {
        forceReasoning: true,
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

    expect(getGmiErrorDetails(retryError)).toEqual({
      name: "AI_RetryError",
      message: "retry exhausted",
      statusCode: 429,
    });
  });

  test("uses GMI's OpenAI-compatible responses provider", () => {
    expect(MODEL.provider).toBe("gmi.responses");
    expect(MODEL.modelId).toBe(DEFAULT_MODEL);
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

    const details = getGmiErrorDetails(error);
    expect(details).toEqual({
      name: "AI_APICallError",
      message: "Backend request failed with status 400",
      statusCode: 400,
      responseBody: `${"x".repeat(2000)}…`,
      guidance:
        "GMI rejected the request (Luna + tools require /v1/responses; inspect responseBody for schema/tool-call issues).",
    });
    expect(details.responseBody).not.toContain("tail");
  });

  test("falls back to serialized data when responseBody is missing", () => {
    const error = Object.assign(new Error("bad request"), {
      name: "AI_APICallError",
      statusCode: 400,
      data: { error: { message: "invalid tools" } },
    });

    expect(getGmiErrorDetails(error)).toEqual({
      name: "AI_APICallError",
      message: "bad request",
      statusCode: 400,
      responseBody: JSON.stringify({ error: { message: "invalid tools" } }),
      guidance:
        "GMI rejected the request (Luna + tools require /v1/responses; inspect responseBody for schema/tool-call issues).",
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

    expect(getGmiErrorDetails(retryError)).toEqual({
      name: "AI_RetryError",
      message: "retry exhausted",
      statusCode: 400,
      responseBody: '{"detail":"bad schema"}',
      guidance:
        "GMI rejected the request (Luna + tools require /v1/responses; inspect responseBody for schema/tool-call issues).",
    });
  });
});
