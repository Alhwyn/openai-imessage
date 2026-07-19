import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";

import { getComposioTools } from "../integrations/index";
import { executionSystemPrompt } from "../prompts/index";
import {
  assertOpenAiApiKey,
  EXECUTION_AGENT_MAX_STEPS,
  getOpenAiErrorDetails,
  OPENAI_MAX_RETRIES,
  OPENAI_PROVIDER_OPTIONS,
  OPENAI_REASONING,
  OPENAI_TEXT_MODEL,
  OPENAI_TEXT_MODEL_ID,
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
  assertOpenAiApiKey();

  const composioTools = await getComposioTools(senderId);
  const tools: ToolSet = { ...composioTools, ...echoTool };
  const toolNames = Object.keys(tools);

  const startedAt = Date.now();
  console.log("[agent] Starting OpenAI execution generation", {
    model: OPENAI_TEXT_MODEL_ID,
    maxRetries: OPENAI_MAX_RETRIES,
    toolCount: toolNames.length,
    composioToolCount: Object.keys(composioTools).length,
    toolNames,
  });

  const result = await generateText({
    model: OPENAI_TEXT_MODEL,
    maxRetries: OPENAI_MAX_RETRIES,
    reasoning: OPENAI_REASONING,
    providerOptions: OPENAI_PROVIDER_OPTIONS,
    system: executionSystemPrompt,
    messages: [{ role: "user", content: buildUserContent(task, images) }],
    tools,
    stopWhen: stepCountIs(EXECUTION_AGENT_MAX_STEPS),
  }).catch((error: unknown) => {
    console.error("[agent] OpenAI execution generation failed", {
      elapsedMs: Date.now() - startedAt,
      ...getOpenAiErrorDetails(error),
    });
    throw error;
  });

  console.log("[agent] OpenAI execution generation completed", {
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

  if (toolNotes.length > 0) return `Task completed. Tool outputs: ${toolNotes.join(" | ")}`;

  return "Task finished with no textual result.";
};
