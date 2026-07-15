import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import { executionSystemPrompt } from "../prompts/index";
import {
  assertGmiApiKey,
  createGmiAbortSignal,
  getGmiErrorDetails,
  getGmiModelId,
  getGmiTemperature,
  GMI_MAX_RETRIES,
  model,
} from "../utils/index";

const stubTools = {
  echo: tool({
    description: "Echo back a string. Useful for simple passthrough tasks.",
    inputSchema: z.object({
      text: z.string().describe("Text to echo"),
    }),
    execute: ({ text }) => ({ echoed: text }),
  }),
  search_mock: tool({
    description: "Mock search that returns placeholder results for a query.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
    }),
    execute: ({ query }) => ({
      query,
      results: [
        {
          title: `Mock result for "${query}"`,
          snippet: `This is a stub search hit about ${query}.`,
        },
      ],
    }),
  }),
};

export const runExecutionAgent = async (task: string): Promise<string> => {
  assertGmiApiKey();

  const startedAt = Date.now();
  console.log("[agent] Starting GMI execution generation", {
    model: getGmiModelId(),
    maxRetries: GMI_MAX_RETRIES,
  });

  const result = await generateText({
    model: model(),
    temperature: getGmiTemperature(1),
    maxRetries: GMI_MAX_RETRIES,
    abortSignal: createGmiAbortSignal(),
    system: executionSystemPrompt,
    prompt: task,
    tools: stubTools,
    stopWhen: stepCountIs(8),
  }).catch((error: unknown) => {
    console.error("[agent] GMI execution generation failed", {
      elapsedMs: Date.now() - startedAt,
      ...getGmiErrorDetails(error),
    });
    throw error;
  });

  console.log("[agent] GMI execution generation completed", {
    elapsedMs: Date.now() - startedAt,
    finishReason: result.finishReason,
    stepCount: result.steps.length,
  });

  const text = result.text.trim();
  if (text) return text;

  const toolNotes = result.steps
    .flatMap((step) => step.toolResults)
    .map((tr) => JSON.stringify(tr.output))
    .filter(Boolean);

  if (toolNotes.length > 0) {
    return `Task completed. Tool outputs: ${toolNotes.join(" | ")}`;
  }

  return "Task finished with no textual result.";
};
