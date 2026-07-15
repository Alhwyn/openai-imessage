import { assertGmiApiKey, getGmiTemperature, model } from "../utils/index";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import type { InteractionEvent, InteractionResult } from "./types";
import { interactionSystemPrompt } from "../prompts/index";
const spaceLocks = new Map<string, Promise<void>>();
import { assignTask } from "../handoff/index";
import { z } from "zod";
import {
  appendHistory,
  buildSystemPrompt,
  editMemory,
  getCuratedMemories,
  getHistory,
  setHistory,
} from "../memory/index";

/**
 * With a space lock.
 * @param spaceId - The space ID.
 * @param fn - The function to run with the space lock.
 * @returns A promise that resolves when the function is run.
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
const formatEventMessage = (event: InteractionEvent): string => {
  switch (event.kind) {
    case "user_message":
      return event.text;
    case "subagent_completion":
      return `[sub-agent completed] taskId=${event.taskId}\nresult:\n${event.result}`;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
};

/**
 * Runs the interaction agent for a space.
 * @param spaceId - The space ID.
 * @param event - The event to run the interaction agent for.
 * @returns A promise that resolves when the interaction agent is run.
 */
const runInteractionAgentUnlocked = async (
  spaceId: string,
  event: InteractionEvent,
): Promise<InteractionResult> => {
  assertGmiApiKey();

  const replies: string[] = [];
  const [history, memories] = await Promise.all([
    getHistory(spaceId),
    getCuratedMemories(spaceId),
  ]);
  const userContent = formatEventMessage(event);
  const system = buildSystemPrompt(interactionSystemPrompt, memories);

  const result = await generateText({
    model: model(),
    temperature: getGmiTemperature(1),
    system,
    messages: [...history, { role: "user", content: userContent }],
    tools: {
      assign_task: tool({
        description:
          "Assign a task to an execution sub-agent. Returns immediately with a taskId; when the worker finishes you will receive a completion event.",
        inputSchema: z.object({
          task: z.string().describe("Clear task instructions for the worker"),
        }),
        execute: async ({ task }) => {
          const { taskId, status } = assignTask({ spaceId, task });
          return { taskId, status };
        },
      }),
      reply_to_user: tool({
        description: "Send a message to the person over iMessage. This is the only outbound path.",
        inputSchema: z.object({
          message: z.string().describe("Text to send to the person"),
        }),
        execute: async ({ message }) => {
          const trimmed = message.trim();
          if (trimmed) replies.push(trimmed);
          return { ok: true, queued: Boolean(trimmed) };
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
        execute: async ({ kind, action, text, old_text }) => {
          const updated = await editMemory({
            spaceId,
            kind,
            action,
            text,
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
  });

  const nextMessages: ModelMessage[] = [
    ...history,
    { role: "user", content: userContent },
    ...result.response.messages,
  ];
  await setHistory(spaceId, nextMessages);

  if (replies.length === 0 && result.text.trim()) {
    replies.push(result.text.trim());
    await appendHistory(spaceId, { role: "assistant", content: result.text.trim() });
  }

  return { replies, messages: await getHistory(spaceId) };
};

/**
 * Runs the interaction agent for a space.
 * @param spaceId - The space ID.
 * @param event - The event to run the interaction agent for.
 * @returns A promise that resolves when the interaction agent is run.
 */
export const runInteractionAgent = async (
  spaceId: string,
  event: InteractionEvent,
): Promise<InteractionResult> => {
  return withSpaceLock(spaceId, () => runInteractionAgentUnlocked(spaceId, event));
};
