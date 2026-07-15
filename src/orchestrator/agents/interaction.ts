import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";

import { assignTask } from "../handoff/index";
import { appendHistory, getHistory, setHistory } from "../memory/index";
import { interactionSystemPrompt } from "../prompts/index";
import type { InteractionEvent, InteractionResult } from "../types/index";
import { assertGmiApiKey, getGmiTemperature, model } from "../utils/index";

export type { InteractionEvent, InteractionResult };

const spaceLocks = new Map<string, Promise<void>>();

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

const runInteractionAgentUnlocked = async (
  spaceId: string,
  event: InteractionEvent,
): Promise<InteractionResult> => {
  assertGmiApiKey();

  const replies: string[] = [];
  const history = getHistory(spaceId);
  const userContent = formatEventMessage(event);

  const result = await generateText({
    model: model(),
    temperature: getGmiTemperature(1),
    system: interactionSystemPrompt,
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
    },
    stopWhen: stepCountIs(10),
  });

  const nextMessages: ModelMessage[] = [
    ...history,
    { role: "user", content: userContent },
    ...result.response.messages,
  ];
  setHistory(spaceId, nextMessages);

  if (replies.length === 0 && result.text.trim()) {
    replies.push(result.text.trim());
    appendHistory(spaceId, { role: "assistant", content: result.text.trim() });
  }

  return { replies, messages: getHistory(spaceId) };
};

export const runInteractionAgent = async (
  spaceId: string,
  event: InteractionEvent,
): Promise<InteractionResult> => {
  return withSpaceLock(spaceId, () => runInteractionAgentUnlocked(spaceId, event));
};
