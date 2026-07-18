import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";

import { getComposioTools } from "../integrations/index";
import { executionSystemPrompt } from "../prompts/index";
import {
  assertGmiApiKey,
  EXECUTION_AGENT_MAX_STEPS,
  getGmiErrorDetails,
  GMI_MAX_RETRIES,
  GMI_MODEL,
  GMI_MODEL_ID,
  GMI_PROVIDER_OPTIONS,
  GMI_REASONING,
} from "../utils/index";
import { buildUserContent } from "../utils/userContent";

import type { InboundImage } from "../contracts";

const echoTool = {
  echo: tool({
    description: "Echo back a string. Useful for simple passthrough tasks.",
    inputSchema: z.object({
      text: z.string().describe("Text to echo"),
    }),
    execute: ({ text }) => ({ echoed: text }),
  }),
} satisfies ToolSet;

/**
 * Runs the execution sub-agent with Composio tools for the sender when available.
 */
export const runExecutionAgent = async (
  task: string,
  images: InboundImage[] = [],
  senderId: string | null = null,
): Promise<string> => {
  assertGmiApiKey();

  const composioTools = await getComposioTools(senderId);
  const tools: ToolSet = { ...composioTools, ...echoTool };
  const toolNames = Object.keys(tools);

  const startedAt = Date.now();
  console.log("[agent] Starting GMI execution generation", {
    model: GMI_MODEL_ID,
    maxRetries: GMI_MAX_RETRIES,
    toolCount: toolNames.length,
    composioToolCount: Object.keys(composioTools).length,
    toolNames,
  });

  const result = await generateText({
    model: GMI_MODEL,
    maxRetries: GMI_MAX_RETRIES,
    reasoning: GMI_REASONING,
    providerOptions: GMI_PROVIDER_OPTIONS,
    system: executionSystemPrompt,
    messages: [{ role: "user", content: buildUserContent(task, images) }],
    tools,
    stopWhen: stepCountIs(EXECUTION_AGENT_MAX_STEPS),
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
    .map((toolResult) => JSON.stringify(toolResult.output))
    .filter(Boolean);

  if (toolNotes.length > 0) {
    return `Task completed. Tool outputs: ${toolNotes.join(" | ")}`;
  }

  return "Task finished with no textual result.";
};
