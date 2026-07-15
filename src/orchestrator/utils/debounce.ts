import type { KeyedDebounce, KeyedDebounceOptions } from "./types";

/**
 * Creates a keyed debounce.
 * @param options - The options for the keyed debounce.
 * @returns The keyed debounce.
 */
export const createKeyedDebounce = <T>(
  options: KeyedDebounceOptions<T>,
): KeyedDebounce<T> => {
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const latestValues = new Map<string, T>();
  const flushQueues = new Map<string, Promise<void>>();

  const cancel = (key: string) => {
    const timer = pendingTimers.get(key);

    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(key);
    }

    latestValues.delete(key);
  };

  const cancelAll = () => {
    for (const timer of pendingTimers.values()) {
      clearTimeout(timer);
    }

    pendingTimers.clear();
    latestValues.clear();
  };

  const runFlush = async (key: string, value: T) => {
    try {
      await Promise.resolve(options.onFlush(key, value));
    } catch (error) {
      console.warn(`[debounce] Flush failed for key ${key}`, error);
    }
  };

  const enqueueFlush = (key: string, value: T): Promise<void> => {
    const previous = flushQueues.get(key) ?? Promise.resolve();
    const current = previous.then(() => runFlush(key, value));
    flushQueues.set(key, current);

    void current.then(() => {
      if (flushQueues.get(key) === current) {
        flushQueues.delete(key);
      }
    });

    return current;
  };

  /**
   * Schedules a value to be flushed.
   * @param key - The key to schedule the value for.
   * @param value - The value to schedule.
   */
  const schedule = (key: string, value: T) => {
    latestValues.set(key, value);

    const existingTimer = pendingTimers.get(key);

    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      pendingTimers.delete(key);
      const latest = latestValues.get(key);
      latestValues.delete(key);

      if (latest === undefined) return;

      void enqueueFlush(key, latest);
    }, typeof options.delayMs === "function" ? options.delayMs() : options.delayMs);

    pendingTimers.set(key, timer);
  };

  const flush = async (key: string) => {
    const existingTimer = pendingTimers.get(key);

    if (existingTimer) {
      clearTimeout(existingTimer);
      pendingTimers.delete(key);
    }

    const latest = latestValues.get(key);
    latestValues.delete(key);

    if (latest === undefined) return;

    await enqueueFlush(key, latest);
  };

  return { schedule, flush, cancel, cancelAll };
};
