import {
  generateText,
  stepCountIs,
  tool,
  type ModelMessage,
  type UserContent,
} from "ai";
import { z } from "zod";

import {
  assignImageTask,
  assignTask,
  getImageTaskStatus,
} from "../handoff/index";
import {
  buildSystemPrompt,
  editMemory,
  getCuratedMemories,
  getHistory,
  setHistory,
} from "../memory/index";
import { interactionSystemPrompt } from "../prompts/index";
import {
  assertGmiApiKey,
  getGmiErrorDetails,
  GMI_IMAGE_MAX_COUNT,
  GMI_IMAGE_MIN_COUNT,
  GMI_MAX_RETRIES,
  GMI_MODEL,
  GMI_MODEL_ID,
  GMI_TEMPERATURE,
  INTERACTION_AGENT_MAX_STEPS,
} from "../utils/index";

import { coalesceTextReplies } from "./outbound";
import { TAPBACK_KEYS } from "./tapbacks";

import type {
  InteractionEvent,
  InteractionResult,
  OutboundItem,
} from "./types";

const spaceLocks = new Map<string, Promise<void>>();

const approximateMinutes = (seconds: number): number => {
  return Math.max(1, Math.ceil(seconds / 60));
};

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
): Promise<InteractionResult> => {
  return withSpaceLock(spaceId, async () => {
    assertGmiApiKey();

    const outbound: OutboundItem[] = [];
    const contextStartedAt = Date.now();
    console.log("[agent] Loading interaction context", {
      spaceId,
      eventKind: event.kind,
    });
    const [history, memories] = await Promise.all([
      getHistory(spaceId),
      getCuratedMemories(spaceId),
    ]);
    console.log("[agent] Interaction context loaded", {
      spaceId,
      eventKind: event.kind,
      elapsedMs: Date.now() - contextStartedAt,
      historyCount: history.length,
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
    console.log("[agent] Starting GMI interaction generation", {
      spaceId,
      eventKind: event.kind,
      historyCount: history.length,
      model: GMI_MODEL_ID,
      maxRetries: GMI_MAX_RETRIES,
    });

    const startedAt = Date.now();
    const result = await generateText({
      model: GMI_MODEL,
      temperature: GMI_TEMPERATURE,
      maxRetries: GMI_MAX_RETRIES,
      system,
      messages: [{ role: "user", content: userContent }],
      tools: {
        get_conversation_history: tool({
          description:
            "Read recent stored conversation history when the latest message depends on earlier context. History is not injected automatically.",
          inputSchema: z.object({}),
          execute: () => ({
            messages: history,
          }),
        }),
        assign_task: tool({
          description:
            "Assign a task to an execution sub-agent. Returns immediately with a taskId; the worker delivers its result directly when finished. Do not use this for image generation.",
          inputSchema: z.object({
            task: z.string().describe("Clear task instructions for the worker"),
          }),
          execute: ({ task }) => {
            const { taskId, status } = assignTask({
              spaceId,
              task,
              images: event.kind === "user_message" ? event.images : undefined,
            });
            return { taskId, status };
          },
        }),
        assign_image_task: tool({
          description:
            "Generate images with the image sub-agent. Pass one prompt per image. Immediately sends a natural acknowledgment with an ETA; when ready the images are delivered as an album directly. Do not send another reply on that turn.",
          inputSchema: z.object({
            prompts: z
              .array(z.string().min(1))
              .min(GMI_IMAGE_MIN_COUNT)
              .max(GMI_IMAGE_MAX_COUNT)
              .describe(
                'One prompt per image. Default shape: ["subject"]. For three cat pics use ["a cat", "a cat", "a cat"]. Vary entries when they want different images.',
              ),
          }),
          execute: ({ prompts }) => {
            console.log("[agent] Image request", {
              spaceId,
              count: prompts.length,
              prompts,
            });
            const { taskId, status, estimatedSeconds } = assignImageTask({
              spaceId,
              prompts,
            });
            const estimatedMinutes = approximateMinutes(estimatedSeconds);
            outbound.push({
              kind: "text",
              text: `got u, making those now, should take about ${estimatedMinutes} min`,
            });
            return { taskId, status, estimatedSeconds };
          },
        }),
        get_image_task_status: tool({
          description:
            "Get real progress for the latest image-generation task in this conversation. Use whenever the person asks for image status, progress, completion count, or ETA.",
          inputSchema: z.object({}),
          execute: () => {
            const progress = getImageTaskStatus(spaceId);
            return progress ?? { state: "not_found" as const };
          },
        }),
        react_to_message: tool({
          description:
            "Tapback on their latest message (love/like/dislike/laugh/emphasize/question). Use when they want a reaction only, or call this before your text reply when they want both.",
          inputSchema: z.object({
            emoji: z.enum(TAPBACK_KEYS).describe("Tapback key"),
          }),
          execute: ({ emoji }) => {
            outbound.push({ kind: "reaction", emoji });
            return { ok: true };
          },
        }),
        memory: tool({
          description:
            "Update persistent memory. Use kind=user for the person's preferences/profile; kind=agent for lasting notes and conventions. Do not store secrets.",
          inputSchema: z.object({
            kind: z.enum(["user", "agent"]).describe("Which memory file to edit"),
            action: z
              .enum(["add", "replace", "remove"])
              .describe("add appends; replace/remove match old_text substring"),
            text: z
              .string()
              .optional()
              .describe("New text for add/replace"),
            old_text: z
              .string()
              .optional()
              .describe("Substring to find for replace/remove"),
          }),
          execute: async ({ kind, action, text: memoryText, old_text }) => {
            const updated = await editMemory({
              spaceId,
              kind,
              action,
              text: memoryText,
              oldText: old_text,
            });
            return {
              ok: true,
              kind: updated.kind,
              body: updated.body,
              updatedAt: updated.updatedAt,
            };
          },
        }),
      },
      stopWhen: stepCountIs(INTERACTION_AGENT_MAX_STEPS),
    }).catch((error: unknown) => {
      console.error("[agent] GMI interaction generation failed", {
        spaceId,
        eventKind: event.kind,
        elapsedMs: Date.now() - startedAt,
        ...getGmiErrorDetails(error),
      });
      throw error;
    });

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

    const nextMessages: ModelMessage[] = [
      ...history,
      { role: "user", content: userContent },
      ...finalOutbound
        .filter((item) => item.kind === "text")
        .map((item) => ({ role: "assistant" as const, content: item.text })),
    ];
    await setHistory(spaceId, nextMessages);

    console.log("[agent] Turn outbound summary", {
      spaceId,
      eventKind: event.kind,
      items: finalOutbound.map((item) =>
        item.kind === "text"
          ? { kind: item.kind, preview: item.text.slice(0, 80) }
          : item.kind === "album"
            ? { kind: item.kind, pathCount: item.paths.length }
            : { kind: item.kind, emoji: item.emoji },
      ),
    });

    return { outbound: finalOutbound, messages: await getHistory(spaceId) };
  });
};
