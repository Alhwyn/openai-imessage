import type { InboundImage } from "../contracts";
import type { UserContent } from "ai";

/**
 * Builds multimodal user content from optional text and inbound images.
 */
export const buildUserContent = (
  text: string,
  images: InboundImage[] = [],
): UserContent => {
  if (images.length === 0) return text;

  return [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...images.map((image) => ({
      type: "file" as const,
      data: image.data,
      filename: image.filename,
      mediaType: image.mediaType,
    })),
  ];
};
