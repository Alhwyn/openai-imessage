import type { Message } from "@spectrum-ts/core";

/** A keyed debounce options. */
export type KeyedDebounceOptions<T> = {
  delayMs: number | (() => number);
  onFlush: (key: string, value: T) => void | Promise<void>;
};

/** A keyed debounce. */
export type KeyedDebounce<T> = {
  schedule: (key: string, value: T) => void;
  flush: (key: string) => Promise<void>;
  cancel: (key: string) => void;
  cancelAll: () => void;
};

/** When set, text uses threaded `message.reply` and reactions target this message. */
export type DeliverOutboundOptions = {
  targetMessage?: Message;
};

/** Options for a bounded recent-ID tracker. */
export type RecentIdTrackerOptions = {
  /** How long an ID stays claimed before it can be accepted again. */
  ttlMs: number;
  /** Maximum number of IDs retained; oldest entries are evicted first. */
  maxSize: number;
  /** Optional clock for tests. */
  now?: () => number;
};

/** Bounded recent-ID tracker for idempotent inbound delivery. */
export type RecentIdTracker = {
  /**
   * Claims an ID if it has not been seen recently.
   * @param id - Stable inbound message ID.
   * @returns True when this is the first claim within the TTL window.
   */
  claim: (id: string) => boolean;
  /** Clears all claimed IDs. */
  clear: () => void;
  /** Number of currently retained IDs (for tests). */
  size: () => number;
};
