import type { Message } from "@spectrum-ts/core";

export const extractInboundText = (message: Message): string => {
  const { content } = message;
  if (content.type === "text") return content.text.trim();
  if (content.type === "markdown") return content.markdown.trim();
  return "";
};
