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
  appendHistory,
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
  getGmiTemperature,
  GMI_IMAGE_MAX_COUNT,
  GMI_IMAGE_MIN_COUNT,
  GMI_MAX_RETRIES,
  GMI_MODEL_ID,
  model,
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
  switch (event.kind) {
    case "user_message": {
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
    }
    case "subagent_completion":
      return `[sub-agent completed] taskId=${event.taskId}\nresult:\n${event.result}`;
    case "image_task_completion": {
      if (event.ok) {
        return [
          `[image task completed] taskId=${event.taskId}`,
          `status=success`,
          `generated=${event.paths.length} image(s) for prompt: ${event.prompt}`,
          `The images will be delivered automatically as an album before your reply.`,
          `Call reply_to_user with one short suggestion for what they might want next.`,
          `Do not mention file paths, task ids, or that images were pre-attached.`,
        ].join("\n");
      }

      return [
        `[image task completed] taskId=${event.taskId}`,
        `status=failed`,
        `requested=${event.count} image(s) for prompt: ${event.prompt}`,
        `error=${event.error ?? "unknown error"}`,
        `Call reply_to_user with a short apology that image generation failed.`,
        `Do not invent image urls or claim the images were sent.`,
      ].join("\n");
    }
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
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

    const startedAt = Date.now();
    console.log("[agent] Starting GMI interaction generation", {
      spaceId,
      eventKind: event.kind,
      historyCount: history.length,
      model: GMI_MODEL_ID,
      maxRetries: GMI_MAX_RETRIES,
    });

    const result = await generateText({
      model: model(),
      temperature: getGmiTemperature(1),
      maxRetries: GMI_MAX_RETRIES,
      system,
      messages: [...history, { role: "user", content: userContent }],
      tools: {
        assign_task: tool({
          description:
            "Assign a task to an execution sub-agent. Returns immediately with a taskId; when the worker finishes you will receive a completion event. Do not use this for image generation.",
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
            "Generate images with the image sub-agent. Pass one prompt per image. Immediately sends a natural acknowledgment with an ETA; when ready the images are delivered as an album and you receive a completion event.",
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
        reply_to_user: tool({
          description:
            "Send a chat text message. Use react_and_reply instead when the person asks for both a tapback and text.",
          inputSchema: z.object({
            message: z
              .string()
              .describe(
                "Plain text to send. Brief replies should be one line; long structured copy may use line breaks and blank lines.",
              ),
          }),
          execute: ({ message }) => {
            console.log("[agent] Tool called: reply_to_user", {
              spaceId,
              messagePreview: message.slice(0, 120),
            });
            outbound.push({ kind: "text", text: message });
            return { ok: true };
          },
        }),
        react_and_reply: tool({
          description:
            "React to the person's latest message with a real iMessage tapback, then send a chat text message. You MUST use this action when they ask to react and also say, send, or reply with text.",
          inputSchema: z.object({
            reaction: z
              .enum(TAPBACK_KEYS)
              .describe("Tapback: love, like, dislike, laugh, emphasize, question"),
            message: z
              .string()
              .describe(
                "Plain-text chat message to send after the tapback. Long structured copy may use line breaks.",
              ),
          }),
          execute: ({ reaction, message }) => {
            outbound.push(
              { kind: "reaction", emoji: reaction },
              { kind: "text", text: message },
            );
            return { ok: true };
          },
        }),
        react_to_message: tool({
          description:
            "Tapback-only on their latest message (love/like/dislike/laugh/emphasize/question). Use react_and_reply when text is also requested. Calling this is the only tapback-only action.",
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
      stopWhen: stepCountIs(10),
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

    if (toolCalls.length === 0) {
      console.warn("[agent] Model returned no tool calls", {
        spaceId,
        eventKind: event.kind,
        finishReason: result.finishReason,
        modelTextPreview: result.text.trim().slice(0, 200) || "(empty)",
      });
    }

    const nextMessages: ModelMessage[] = [
      ...history,
      { role: "user", content: userContent },
      ...result.response.messages,
    ];
    await setHistory(spaceId, nextMessages);

    const chatText = result.text.trim();
    if (finalOutbound.length === 0 && chatText) {
      console.warn("[agent] Using plain-text fallback (no tools queued)", {
        spaceId,
        eventKind: event.kind,
        textPreview: chatText.slice(0, 200),
      });
      finalOutbound.push({ kind: "text", text: chatText });
      await appendHistory(spaceId, { role: "assistant", content: chatText });
    }

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
