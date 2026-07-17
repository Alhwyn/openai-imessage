import {
  generateText,
  stepCountIs,
  type ToolSet,
  type UserContent,
} from "ai";

import { getComposioTools } from "../integrations/index";
import {
  appendHistory,
  buildSystemPrompt,
  getCuratedMemories,
} from "../memory/index";
import { coalesceTextReplies, summarizeOutbound } from "../outbound";
import { interactionSystemPrompt } from "../prompts/index";
import {
  assertGmiApiKey,
  getGmiErrorDetails,
  GMI_MAX_RETRIES,
  GMI_MODEL,
  GMI_MODEL_ID,
  GMI_PROVIDER_OPTIONS,
  GMI_REASONING,
  GMI_TEMPERATURE,
  INTERACTION_AGENT_MAX_STEPS,
} from "../utils/index";

import { buildInteractionTools } from "./interactionTools";

import type {
  InteractionEvent,
  InteractionResult,
  OutboundItem,
} from "./types";
import type { DeliveryTarget } from "../handoff/types";

const spaceLocks = new Map<string, Promise<void>>();

/**
 * Runs a function after earlier work for the same space has completed.
 * @param spaceId - The space ID.
 * @param fn - The function to run with the space lock.
 * @returns The function result.
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
 * Formats an event message.
 * @param event - The event to format.
 * @returns The formatted event message.
 */
const formatEventMessage = (event: InteractionEvent): UserContent => {
  if (!event.images?.length) return event.text;

  return [
    ...(event.text ? [{ type: "text" as const, text: event.text }] : []),
    ...event.images.map((image) => ({
      type: "file" as const,
      data: image.data,
      filename: image.filename,
      mediaType: image.mediaType,
    })),
  ];
};

/**
 * Serializes and runs an interaction turn for a space.
 * @param spaceId - The space ID.
 * @param event - The event to run the interaction agent for.
 * @returns The interaction result.
 */
export const runInteractionAgent = async (
  spaceId: string,
  event: InteractionEvent,
  deliveryTarget: DeliveryTarget,
): Promise<InteractionResult> => {
  return withSpaceLock(spaceId, async () => {
    assertGmiApiKey();

    const outbound: OutboundItem[] = [];
    const contextStartedAt = Date.now();
    console.log("[agent] Loading interaction context", {
      spaceId,
      eventKind: event.kind,
    });
    const [memories, composioTools] = await Promise.all([
      getCuratedMemories(spaceId),
      getComposioTools(event.senderId),
    ]);
    console.log("[agent] Interaction context loaded", {
      spaceId,
      eventKind: event.kind,
      elapsedMs: Date.now() - contextStartedAt,
    });
    const userContent = formatEventMessage(event);
    const system = buildSystemPrompt(interactionSystemPrompt, memories);

    if (event.kind === "user_message") {
      console.log("[agent] Inbound user message", {
        spaceId,
        text: event.text.slice(0, 200),
        imageCount: event.images?.length ?? 0,
      });
    }

    const toolBuildInput = {
      deliveryTarget,
      event,
      outbound,
      spaceId,
    };
    const toolsWithComposio = buildInteractionTools({
      ...toolBuildInput,
      composioTools,
    });
    const composioToolCount = Object.keys(composioTools).length;
    const toolNames = Object.keys(toolsWithComposio);
    const composioAttachedCount = Object.keys(composioTools).filter(
      (name) => toolsWithComposio[name] === composioTools[name],
    ).length;

    console.log("[agent] Starting GMI interaction generation", {
      spaceId,
      eventKind: event.kind,
      model: GMI_MODEL_ID,
      maxRetries: GMI_MAX_RETRIES,
      toolCount: toolNames.length,
      composioToolCount,
      composioAttachedCount,
      firstPartyToolCount: toolNames.length - composioAttachedCount,
      toolNames,
    });

    const startedAt = Date.now();

    const runGeneration = (tools: ToolSet) =>
      generateText({
        model: GMI_MODEL,
        temperature: GMI_TEMPERATURE,
        maxRetries: GMI_MAX_RETRIES,
        reasoning: GMI_REASONING,
        providerOptions: GMI_PROVIDER_OPTIONS,
        system,
        messages: [{ role: "user", content: userContent }],
        tools,
        stopWhen: stepCountIs(INTERACTION_AGENT_MAX_STEPS),
        onStepFinish: (step) => {
          console.log("[agent] GMI interaction step finished", {
            spaceId,
            stepNumber: step.stepNumber,
            finishReason: step.finishReason,
            toolCalls: step.toolCalls.map((call) => call.toolName),
          });
        },
      });

    let result: Awaited<ReturnType<typeof runGeneration>>;
    try {
      result = await runGeneration(toolsWithComposio);
    } catch (error: unknown) {
      const details = getGmiErrorDetails(error);
      console.error("[agent] GMI interaction generation failed", {
        spaceId,
        eventKind: event.kind,
        elapsedMs: Date.now() - startedAt,
        ...details,
      });

      if (details.statusCode !== 400 || composioAttachedCount === 0) {
        throw error;
      }

      console.warn("[agent] Retrying without Composio tools after GMI 400", {
        spaceId,
        eventKind: event.kind,
      });
      outbound.length = 0;
      const firstPartyTools = buildInteractionTools({
        ...toolBuildInput,
        composioTools: {},
      });

      try {
        result = await runGeneration(firstPartyTools);
      } catch (retryError: unknown) {
        console.error("[agent] GMI interaction generation failed", {
          spaceId,
          eventKind: event.kind,
          elapsedMs: Date.now() - startedAt,
          retryWithoutComposio: true,
          ...getGmiErrorDetails(retryError),
        });
        throw retryError;
      }
    }

    const finalOutbound = coalesceTextReplies(outbound);
    if (finalOutbound.length < outbound.length) {
      console.warn("[agent] Coalesced duplicate text replies", {
        spaceId,
        removedCount: outbound.length - finalOutbound.length,
      });
    }

    const toolCalls = result.steps.flatMap((step) =>
      step.toolCalls.map((call) => call.toolName),
    );
    const toolResults = result.steps.flatMap((step) =>
      step.toolResults.map((tr) => tr.toolName),
    );

    console.log("[agent] GMI interaction generation completed", {
      spaceId,
      eventKind: event.kind,
      elapsedMs: Date.now() - startedAt,
      finishReason: result.finishReason,
      stepCount: result.steps.length,
      toolCalls,
      toolResults,
      modelTextPreview: result.text.trim().slice(0, 120) || undefined,
      queuedCount: finalOutbound.length,
    });

    const modelText = result.text.trim();
    if (modelText) {
      console.log("[agent] Using model text response", {
        spaceId,
        modelTextPreview: modelText.slice(0, 200),
      });
      finalOutbound.push({ kind: "text", text: modelText });
    } else if (toolCalls.length === 0) {
      console.warn("[agent] Model returned no tools or text", {
        spaceId,
        eventKind: event.kind,
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
      eventKind: event.kind,
      items: summarizeOutbound(finalOutbound),
    });

    return { outbound: finalOutbound };
  });
};
