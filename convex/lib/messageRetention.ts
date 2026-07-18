export const MESSAGE_PRUNE_BATCH_SIZE = 100;

type MessagePruneBatch<T> = {
  hasMore: boolean;
  rows: T[];
};

/**
 * Selects a bounded deletion batch from messages ordered newest first.
 * The input includes one lookahead row so callers know when to continue.
 */
export const getMessagePruneBatch = <T>(
  newestFirst: T[],
  keep: number,
): MessagePruneBatch<T> => {
  const deleteThrough = keep + MESSAGE_PRUNE_BATCH_SIZE;

  return {
    hasMore: newestFirst.length > deleteThrough,
    rows: newestFirst.slice(keep, deleteThrough),
  };
};
