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
