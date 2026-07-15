import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import { executionSystemPrompt } from "../prompts/index";
import { assertGmiApiKey, getGmiTemperature, model } from "../utils/index";

const stubTools = {
  echo: tool({
    description: "Echo back a string. Useful for simple passthrough tasks.",
    inputSchema: z.object({
      text: z.string().describe("Text to echo"),
    }),
    execute: async ({ text }) => ({ echoed: text }),
  }),
  search_mock: tool({
    description: "Mock search that returns placeholder results for a query.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
    }),
    execute: async ({ query }) => ({
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

  const result = await generateText({
    model: model(),
    temperature: getGmiTemperature(1),
    system: executionSystemPrompt,
    prompt: task,
    tools: stubTools,
    stopWhen: stepCountIs(8),
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
