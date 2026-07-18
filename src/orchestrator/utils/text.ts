import type { InboundImage } from "../contracts";
import type { Message } from "@spectrum-ts/core";

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const normalizeMediaType = (mediaType: string): string => {
  const normalized = mediaType.split(";")[0]?.trim().toLowerCase() ?? "";
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
};

/**
 * Extracts the inbound text from a message.
 * @param message - The message to extract the inbound text from.
 * @returns The inbound text.
 */
export const extractInboundText = (message: Message): string => {
  const { content } = message;
  if (content.type === "text") return content.text.trim();
  if (content.type === "markdown") return content.markdown.trim();
  if (content.type === "group") {
    return content.items
      .map(extractInboundText)
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

/**
 * Reads supported inbound image attachments, including grouped messages.
 * @param message - The message that may contain image attachments.
 * @returns All supported image inputs in message order.
 */
export const extractInboundImages = async (
  message: Message,
): Promise<InboundImage[]> => {
  const { content } = message;

  if (content.type === "group") return (await Promise.all(content.items.map(extractInboundImages))).flat();

  if (content.type !== "attachment") return [];

  const mediaType = normalizeMediaType(content.mimeType);
  
  if (!SUPPORTED_IMAGE_MEDIA_TYPES.has(mediaType)) return [];

  return [
    {
      data: new Uint8Array(await content.read()),
      filename: content.name,
      mediaType,
    },
  ];
};
