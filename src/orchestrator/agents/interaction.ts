import {
  generateText,
  stepCountIs,
  type ModelMessage,
} from "ai";

import { formatComputerRunContext } from "../computer/index";
import { getLatestComputerRunForSpace } from "../db/index";
import { getComposioTools } from "../integrations/index";
import {
  appendHistory,
  buildSystemPrompt,
  getCuratedMemories,
  getHistory,
} from "../memory/index";
import { summarizeOutbound } from "../outbound";
import { interactionSystemPrompt } from "../prompts/index";
import {
  assertOpenAiApiKey,
  getOpenAiErrorDetails,
  INTERACTION_AGENT_MAX_STEPS,
  OPENAI_MAX_RETRIES,
  OPENAI_PROVIDER_OPTIONS,
  OPENAI_REASONING,
  OPENAI_TEXT_MODEL,
  OPENAI_TEXT_MODEL_ID,
} from "../utils/index";
import { buildUserContent } from "../utils/userContent";

import { buildInteractionTools } from "./interactionTools";
import { createTurnEffectCollector } from "./turnEffects";

import type { InteractionEvent, InteractionResult } from "./types";
import type { DeliveryTarget } from "../handoff/types";

const spaceLocks = new Map<string, Promise<void>>();

/**
 * Runs a function after earlier work for the same space has completed.
 */
const withSpaceLock = async <T>(spaceId: string, fn: () => Promise<T>): Promise<T> => {
  const previous = spaceLocks.get(spaceId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  spaceLocks.set(
    spaceId,
    previous.then(() => gate).catch(() => gate),
  );

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
};

/**
 * Serializes and runs an interaction turn for a space.
 */
export const runInteractionAgent = async (
  spaceId: string,
  event: InteractionEvent,
  deliveryTarget: DeliveryTarget,
): Promise<InteractionResult> => {
  return withSpaceLock(spaceId, async () => {
    assertOpenAiApiKey();

    const effects = createTurnEffectCollector();
    const contextStartedAt = Date.now();
    console.log("[agent] Loading interaction context", { spaceId });
    const [memories, composioTools, history, latestComputerRun] =
      await Promise.all([
        getCuratedMemories(spaceId),
        getComposioTools(event.senderId),
        getHistory(spaceId),
        getLatestComputerRunForSpace(spaceId).catch(() => null),
      ]);
    console.log("[agent] Interaction context loaded", {
      spaceId,
      historyCount: history.length,
      computerState: latestComputerRun?.state ?? "none",
      elapsedMs: Date.now() - contextStartedAt,
    });
    const userContent = buildUserContent(event.text, event.images);
    const computerContext = formatComputerRunContext(latestComputerRun);
    const system = [
      buildSystemPrompt(interactionSystemPrompt, memories),
      computerContext,
    ]
      .filter(Boolean)
      .join("\n\n");
    const messages: ModelMessage[] = [
      ...history,
      { role: "user", content: userContent },
    ];

    console.log("[agent] Inbound user message", {
      spaceId,
      text: event.text.slice(0, 200),
      imageCount: event.images?.length ?? 0,
    });

    const tools = buildInteractionTools({
      deliveryTarget,
      event,
      effects,
      spaceId,
      composioTools,
    });
    const composioToolCount = Object.keys(composioTools).length;
    const toolNames = Object.keys(tools);
    const composioAttachedCount = Object.keys(composioTools).filter(
      (name) => tools[name] === composioTools[name],
    ).length;

    console.log("[agent] Starting OpenAI interaction generation", {
      spaceId,
      model: OPENAI_TEXT_MODEL_ID,
      maxRetries: OPENAI_MAX_RETRIES,
      toolCount: toolNames.length,
      composioToolCount,
      composioAttachedCount,
      firstPartyToolCount: toolNames.length - composioAttachedCount,
      historyCount: history.length,
      toolNames,
    });

    const startedAt = Date.now();

    const result = await generateText({
      model: OPENAI_TEXT_MODEL,
      maxRetries: OPENAI_MAX_RETRIES,
      reasoning: OPENAI_REASONING,
      providerOptions: OPENAI_PROVIDER_OPTIONS,
      system,
      messages,
      tools,
      stopWhen: stepCountIs(INTERACTION_AGENT_MAX_STEPS),
      onStepFinish: (step) => {
        console.log("[agent] OpenAI interaction step finished", {
          spaceId,
          stepNumber: step.stepNumber,
          finishReason: step.finishReason,
          toolCalls: step.toolCalls.map((call) => call.toolName),
        });
      },
    }).catch((error: unknown) => {
      console.error("[agent] OpenAI interaction generation failed", {
        spaceId,
        elapsedMs: Date.now() - startedAt,
        ...getOpenAiErrorDetails(error),
      });
      throw error;
    });

    const finalOutbound = effects.finalize(result.text);
    const toolCalls = result.steps.flatMap((step) =>
      step.toolCalls.map((call) => call.toolName),
    );
    const toolResults = result.steps.flatMap((step) =>
      step.toolResults.map((tr) => tr.toolName),
    );

    console.log("[agent] OpenAI interaction generation completed", {
      spaceId,
      elapsedMs: Date.now() - startedAt,
      finishReason: result.finishReason,
      stepCount: result.steps.length,
      toolCalls,
      toolResults,
      modelTextPreview: result.text.trim().slice(0, 120) || undefined,
      queuedCount: finalOutbound.length,
    });

    if (!result.text.trim() && toolCalls.length === 0) {
      console.warn("[agent] Model returned no tools or text", {
        spaceId,
        finishReason: result.finishReason,
      });
    }

    await appendHistory(
      spaceId,
      { role: "user", content: userContent },
      ...finalOutbound
        .filter((item) => item.kind === "text")
        .map((item) => ({ role: "assistant" as const, content: item.text })),
    );

    console.log("[agent] Turn outbound summary", {
      spaceId,
      items: summarizeOutbound(finalOutbound),
    });

    return { outbound: finalOutbound };
  });
};
