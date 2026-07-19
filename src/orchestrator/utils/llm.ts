import { createOpenAI } from "@ai-sdk/openai";

import {
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_TEXT_MODEL_ID,
} from "./constants";
import { getOpenAiApiKey } from "./openaiEnv";

const RESPONSE_BODY_MAX_CHARS = 2000;

export type OpenAiErrorDetails = {
  guidance?: string;
  message: string;
  name: string;
  responseBody?: string;
  statusCode?: number;
};

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: OPENAI_BASE_URL,
});

export const OPENAI_TEXT_MODEL = openai.responses(OPENAI_TEXT_MODEL_ID);

const getStatusCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;

  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }

  if ("lastError" in error) {
    return getStatusCode(error.lastError);
  }

  return undefined;
};

const getNestedField = (error: unknown, field: string): unknown => {
  if (!error || typeof error !== "object") return undefined;

  const record = error as Record<string, unknown>;
  if (field in record) {
    return record[field];
  }

  if ("lastError" in record) {
    return getNestedField(record.lastError, field);
  }

  return undefined;
};

const truncate = (value: string): string => {
  if (value.length <= RESPONSE_BODY_MAX_CHARS) return value;
  return `${value.slice(0, RESPONSE_BODY_MAX_CHARS)}…`;
};

const getResponseBody = (error: unknown): string | undefined => {
  const responseBody = getNestedField(error, "responseBody");
  if (typeof responseBody === "string" && responseBody.length > 0) {
    return truncate(responseBody);
  }

  const data = getNestedField(error, "data");
  if (data === undefined || data === null) return undefined;

  try {
    return truncate(JSON.stringify(data));
  } catch {
    return truncate("[unserializable error data]");
  }
};

const getGuidance = (
  statusCode: number | undefined,
  name: string,
): string | undefined => {
  if (statusCode === 401) {
    return "OpenAI rejected the credential. Verify OPENAI_API_KEY is an active API key.";
  }
  if (statusCode === 400) {
    return "OpenAI rejected the request (inspect responseBody for schema/tool-call issues).";
  }
  if (name === "AI_LoadAPIKeyError") {
    return "OPENAI_API_KEY was missing or unloaded when the provider was created. Set it before startup and restart the Bun process.";
  }
  return undefined;
};

export const getOpenAiErrorDetails = (error: unknown): OpenAiErrorDetails => {
  const statusCode = getStatusCode(error);
  const name = error instanceof Error ? error.name : "UnknownError";
  const guidance = getGuidance(statusCode, name);
  const responseBody = getResponseBody(error);

  if (error instanceof Error) {
    return {
      name,
      message: error.message,
      statusCode,
      ...(responseBody ? { responseBody } : {}),
      ...(guidance ? { guidance } : {}),
    };
  }

  return {
    name,
    message: String(error),
    statusCode,
    ...(responseBody ? { responseBody } : {}),
    ...(guidance ? { guidance } : {}),
  };
};

export const assertOpenAiApiKey = (): void => {
  getOpenAiApiKey("starting the orchestrator");
};
