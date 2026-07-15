import type { ModelMessage } from "ai";
import {
  appendMessages,
  listRecentMessages,
  replaceMessageWindow,
  type MessageInput,
} from "../db/index";
import { MAX_HISTORY_MESSAGES } from "./utils";

/**
 * Converts a message to a search text.
 * @param message - The message to convert.
 * @returns The search text.
 */
const searchTextFromMessage = (message: ModelMessage): string => {
  const { content } = message;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content);

  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "object" && part !== null && "type" in part) {
      if (part.type === "text" && "text" in part && typeof part.text === "string") {
        parts.push(part.text);
      } else if (part.type === "tool-call" && "toolName" in part) {
        parts.push(`[tool-call:${String(part.toolName)}]`);
      } else if (part.type === "tool-result" && "toolName" in part) {
        parts.push(`[tool-result:${String(part.toolName)}]`);
      }
    }
  }
  return parts.join(" ").trim() || JSON.stringify(content);
};

/**
 * Converts a message to a stored input.
 * @param message - The message to convert.
 * @returns The stored input.
 */
const toStoredInput = (message: ModelMessage): MessageInput => {
  return {
    role: message.role,
    searchText: searchTextFromMessage(message),
    payloadJson: JSON.stringify(message),
  };
};

/**
 * Parses a message payload from a string.
 * @param payloadJson - The payload JSON string.
 * @returns The parsed message or null if the payload is invalid.
 */
const fromStoredPayload = (payloadJson: string): ModelMessage | null => {
  try {
    return JSON.parse(payloadJson) as ModelMessage;
  } catch {
    console.warn("[memory] Failed to parse message payload");
    return null;
  }
};

/**
 * Gets the history for a space.
 * @param spaceId - The space ID.
 * @returns A promise that resolves when the history is retrieved.
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
 * Sets the history for a space.
 * @param spaceId - The space ID.
 * @param messages - The messages to set.
 * @returns A promise that resolves when the history is set.
 */
export const setHistory = async (spaceId: string, messages: ModelMessage[]): Promise<void> => {
  const window = messages.slice(-MAX_HISTORY_MESSAGES);
  await replaceMessageWindow(
    spaceId,
    window.map(toStoredInput),
    MAX_HISTORY_MESSAGES,
  );
};

/**
 * Appends messages to the history.
 * @param spaceId - The space ID.
 * @param messages - The messages to append.
 * @returns A promise that resolves when the messages are appended.
 */
export const appendHistory = async (
  spaceId: string,
  ...messages: ModelMessage[]
): Promise<void> => {
  if (messages.length === 0) return;
  await appendMessages(spaceId, messages.map(toStoredInput), MAX_HISTORY_MESSAGES);
};
