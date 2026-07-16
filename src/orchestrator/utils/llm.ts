import { createOpenAI } from "@ai-sdk/openai";

export const GMI_CLOUD_BASE_URL = "https://api.gmi-serving.com/v1";
export const DEFAULT_GMI_MODEL = "moonshotai/kimi-k2.7-code-highspeed";
/** Match the reference provider's three total attempts without a minute-long silent wait. */
export const GMI_MAX_RETRIES = 2;

export type GmiErrorDetails = {
  guidance?: string;
  message: string;
  name: string;
  statusCode?: number;
};

/** Models that only accept a single temperature value. */
const MODEL_FIXED_TEMPERATURE: Record<string, number> = {
  "moonshotai/kimi-k2.7-code-highspeed": 1,
};

const getGmiApiKey = (): string => {
  const configuredValue = process.env.GMI_CLOUD_API_KEY?.trim();
  if (!configuredValue) {
    throw new Error(
      "Missing or unloaded GMI_CLOUD_API_KEY in this Bun process. Set it before startup, then restart `bun run start` after editing an environment file.",
    );
  }

  const apiKey = configuredValue.replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) {
    throw new Error(
      "Invalid GMI_CLOUD_API_KEY. Set it to the API key only, without the Bearer prefix.",
    );
  }

  return apiKey;
};

export const getGmiModelId = (): string => {
  return process.env.GMI_MODEL?.trim() || DEFAULT_GMI_MODEL;
};

export const model = () => {
  const gmi = createOpenAI({
    baseURL: GMI_CLOUD_BASE_URL,
    apiKey: getGmiApiKey(),
    name: "gmi",
  });

  return gmi.chat(getGmiModelId());
};

export const getGmiTemperature = (requested = 1): number => {
  const modelId = getGmiModelId();
  return MODEL_FIXED_TEMPERATURE[modelId] ?? requested;
};

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
  getGmiApiKey();
};
