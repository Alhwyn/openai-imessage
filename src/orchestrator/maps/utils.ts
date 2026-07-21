import type { Message } from "@spectrum-ts/core";

export const resolveSenderAddress = (
  message: Message,
  senderId: string | null,
): string | null => {
  const sender = message.sender;
  if (sender && typeof sender === "object") {
    if (
      "address" in sender &&
      typeof sender.address === "string" &&
      sender.address.trim()
    ) return sender.address.trim();
    if (typeof sender.id === "string" && sender.id.trim()) return sender.id.trim();
  }
  return senderId?.trim() || null;
};
