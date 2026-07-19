import {
  appendMessages,
  listRecentMessages,
  type MessageInput,
  type MessageRole,
} from "../db/index";

import { MAX_HISTORY_MESSAGES } from "./utils";

import type { ModelMessage, UserContent } from "ai";

/**
 * Text-only history contract: only user/assistant messages with string or
 * text-part array content are persisted and reloaded.
 */
const withoutTransientMedia = (message: ModelMessage): ModelMessage => {
  if (message.role !== "user" || !Array.isArray(message.content)) return message;

  const content: UserContent = message.content.map((part) => {
    if (part.type !== "file" && part.type !== "image") return part;

    const filename = "filename" in part ? part.filename : undefined;
    return {
      type: "text",
      text: filename ? `[Image attachment: ${filename}]` : "[Image attachment]",
    };
  });

  return { ...message, content };
};

const assertStoredRole = (role: ModelMessage["role"]): MessageRole => {
  if (role !== "user" && role !== "assistant") throw new Error(`Only user/assistant messages can be stored, got ${role}`);

  return role;
};

/**
 * Converts a stored message to search text (text parts only).
 */
const searchTextFromMessage = (message: ModelMessage): string => {
  const { content } = message;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content);

  const parts: string[] = [];
  for (const part of content) if (
    typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
  ) parts.push(part.text);

  return parts.join(" ").trim() || JSON.stringify(content);
};

const toStoredInput = (message: ModelMessage): MessageInput => {
  const storedMessage = withoutTransientMedia(message);
  const role = assertStoredRole(storedMessage.role);
  return {
    role,
    searchText: searchTextFromMessage(storedMessage),
    payloadJson: JSON.stringify({ ...storedMessage, role }),
  };
};

/** True when a payload matches the text-only history contract. */
export const isStoredHistoryMessage = (value: unknown): value is ModelMessage => {
  if (!value || typeof value !== "object") return false;
  if (!("role" in value) || !("content" in value)) return false;
  if (value.role !== "user" && value.role !== "assistant") return false;
  if (typeof value.content === "string") return true;
  if (!Array.isArray(value.content)) return false;

  const parts = value.content as unknown[];
  return parts.every(
    (part) =>
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string",
  );
};

const fromStoredPayload = (payloadJson: string): ModelMessage | null => {
  try {
    const parsed: unknown = JSON.parse(payloadJson);
    if (isStoredHistoryMessage(parsed)) return parsed;
    console.warn("[memory] Ignored unsupported message payload");
    return null;
  } catch {
    console.warn("[memory] Failed to parse message payload");
    return null;
  }
};

/**
 * Gets the history for a space.
 */
export const getHistory = async (spaceId: string): Promise<ModelMessage[]> => {
  const rows = await listRecentMessages(spaceId, MAX_HISTORY_MESSAGES);
  const messages: ModelMessage[] = [];
  for (const row of rows) {
    const parsed = fromStoredPayload(row.payloadJson);
    if (parsed) messages.push(parsed);
  }
  return messages;
};

/**
 * Appends messages to the history.
 */
export const appendHistory = async (
  spaceId: string,
  ...messages: ModelMessage[]
): Promise<void> => {
  if (messages.length === 0) return;
  await appendMessages(spaceId, messages.map(toStoredInput), MAX_HISTORY_MESSAGES);
};

/**
 * Records a plain assistant text message in history.
 */
export const recordAssistantText = async (
  spaceId: string,
  text: string,
): Promise<void> => {
  await appendHistory(spaceId, { role: "assistant", content: text });
};
