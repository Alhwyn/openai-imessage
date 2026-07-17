import { createOpenAI } from "@ai-sdk/openai";

import {
  GMI_API_KEY,
  GMI_CLOUD_BASE_URL,
  GMI_MODEL_ID,
} from "./constants";

export type GmiErrorDetails = {
  guidance?: string;
  message: string;
  name: string;
  statusCode?: number;
};

const gmi = createOpenAI({
  baseURL: GMI_CLOUD_BASE_URL,
  apiKey: GMI_API_KEY,
  name: "gmi",
});

export const GMI_MODEL = gmi.chat(GMI_MODEL_ID);

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

export const getGmiErrorDetails = (error: unknown): GmiErrorDetails => {
  const statusCode = getStatusCode(error);
  const name = error instanceof Error ? error.name : "UnknownError";
  const guidance =
    statusCode === 401
      ? "GMI rejected the credential. Verify GMI_CLOUD_API_KEY is an active GMI inference API key."
      : name === "AI_LoadAPIKeyError"
        ? "GMI_CLOUD_API_KEY was missing or unloaded when the provider was created. Set it before startup and restart the Bun process."
      : undefined;

  if (error instanceof Error) {
    return {
      name,
      message: error.message,
      statusCode,
      ...(guidance ? { guidance } : {}),
    };
  }

  return {
    name,
    message: String(error),
    statusCode,
    ...(guidance ? { guidance } : {}),
  };
};

export const assertGmiApiKey = (): void => {
  if (!GMI_API_KEY) throw new Error("Missing GMI_CLOUD_API_KEY");
};
