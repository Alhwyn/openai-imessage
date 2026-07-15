import type { Message } from "@spectrum-ts/core";

/**
 * Extracts the inbound text from a message.
 * @param message - The message to extract the inbound text from.
 * @returns The inbound text.
 */
export const extractInboundText = (message: Message): string => {
  const { content } = message;
  if (content.type === "text") return content.text.trim();
  if (content.type === "markdown") return content.markdown.trim();
  return "";
};
