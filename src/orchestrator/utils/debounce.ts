type KeyedDebounceOptions<T> = {
  delayMs: number | (() => number);
  onFlush: (key: string, value: T) => void | Promise<void>;
};

type KeyedDebounce<T> = {
  schedule: (key: string, value: T) => void;
  flush: (key: string) => Promise<void>;
  cancel: (key: string) => void;
  cancelAll: () => void;
};

const resolveDelayMs = (delayMs: number | (() => number)) => {
  return typeof delayMs === "function" ? delayMs() : delayMs;
};

export const createKeyedDebounce = <T>(
  options: KeyedDebounceOptions<T>,
): KeyedDebounce<T> => {
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const latestValues = new Map<string, T>();

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

  const schedule = (key: string, value: T) => {
    latestValues.set(key, value);

    const existingTimer = pendingTimers.get(key);

    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      pendingTimers.delete(key);
      const latest = latestValues.get(key);
      latestValues.delete(key);

      if (latest === undefined) return;

      void runFlush(key, latest);
    }, resolveDelayMs(options.delayMs));

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

    await runFlush(key, latest);
  };

  return { schedule, flush, cancel, cancelAll };
};
