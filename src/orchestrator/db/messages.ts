import { api } from "../../../convex/_generated/api";

import { getBridgeSecret, getConvexClient } from "./client";

export type StoredMessage = {
  role: string;
  searchText: string;
  payloadJson: string;
  createdAt: number;
};

export type MessageInput = {
  role: string;
  searchText: string;
  payloadJson: string;
  createdAt?: number;
};

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
