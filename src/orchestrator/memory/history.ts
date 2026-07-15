import type { ModelMessage } from "ai";

const histories = new Map<string, ModelMessage[]>();
const MAX_MESSAGES = 40;

export const getHistory = (spaceId: string): ModelMessage[] => {
  return [...(histories.get(spaceId) ?? [])];
};

export const appendHistory = (spaceId: string, ...messages: ModelMessage[]): void => {
  const next = [...(histories.get(spaceId) ?? []), ...messages];
  histories.set(spaceId, next.slice(-MAX_MESSAGES));
};

export const setHistory = (spaceId: string, messages: ModelMessage[]): void => {
  histories.set(spaceId, messages.slice(-MAX_MESSAGES));
};
