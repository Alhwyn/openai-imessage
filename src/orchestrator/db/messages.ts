import { api } from "../../../convex/_generated/api";

import { getBridgeSecret, getConvexClient } from "./client";
import type { MessageInput, StoredMessage } from "./types";

/**
 * Lists recent messages for a space.
 * @param spaceId - The space ID.
 * @param limit - The limit of messages to list.
 * @returns The recent messages in chronological order.
 */
export const listRecentMessages = async (
  spaceId: string,
  limit: number,
): Promise<StoredMessage[]> => {
  return await getConvexClient().query(api.messages.listRecent, {
    secret: getBridgeSecret(),
    spaceId,
    limit,
  });
};

/**
 * Replaces the message window for a space.
 * @param spaceId - The space ID.
 * @param messages - The messages to replace the window.
 * @param keep - The number of messages to keep.
 * @returns The number of messages retained.
 */
export const replaceMessageWindow = async (
  spaceId: string,
  messages: MessageInput[],
  keep: number,
): Promise<{ count: number }> => {
  return await getConvexClient().mutation(api.messages.replaceWindow, {
    secret: getBridgeSecret(),
    spaceId,
    messages,
    keep,
  });
};

/**
 * Appends messages to a space.
 * @param spaceId - The space ID.
 * @param messages - The messages to append.
 * @param keep - The number of messages to keep.
 * @returns The number of messages appended.
 */
export const appendMessages = async (
  spaceId: string,
  messages: MessageInput[],
  keep: number,
): Promise<{ count: number }> => {
  return await getConvexClient().mutation(api.messages.appendMany, {
    secret: getBridgeSecret(),
    spaceId,
    messages,
    keep,
  });
};
