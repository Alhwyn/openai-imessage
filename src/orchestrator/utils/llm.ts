import { createOpenAI } from "@ai-sdk/openai";

export const GMI_CLOUD_BASE_URL = "https://api.gmi-serving.com/v1";
export const DEFAULT_GMI_MODEL = "moonshotai/kimi-k2.7-code-highspeed";

/** Models that only accept a single temperature value. */
const MODEL_FIXED_TEMPERATURE: Record<string, number> = {
  "moonshotai/kimi-k2.7-code-highspeed": 1,
};

export const gmi = createOpenAI({
  baseURL: GMI_CLOUD_BASE_URL,
  apiKey: process.env.GMI_CLOUD_API_KEY,
  name: "gmi",
});

export const getGmiModelId = (): string => {
  return process.env.GMI_MODEL?.trim() || DEFAULT_GMI_MODEL;
};

export const model = () => {
  return gmi(getGmiModelId());
};

export const getGmiTemperature = (requested = 1): number => {
  const modelId = getGmiModelId();
  return MODEL_FIXED_TEMPERATURE[modelId] ?? requested;
};

export const assertGmiApiKey = (): void => {
  if (!process.env.GMI_CLOUD_API_KEY?.trim()) {
    throw new Error("Missing GMI_CLOUD_API_KEY. Add it to your .env.");
  }
};
