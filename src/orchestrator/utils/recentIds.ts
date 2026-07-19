import type { RecentIdTracker, RecentIdTrackerOptions } from "./types";

/**
 * Creates a bounded recent-ID tracker for idempotent inbound delivery.
 * @param options - TTL and capacity for retained IDs.
 * @returns Tracker that claims each ID at most once until expiry/eviction.
 */
export const createRecentIdTracker = (
  options: RecentIdTrackerOptions,
): RecentIdTracker => {
  const seenAt = new Map<string, number>();
  const now = options.now ?? Date.now;

  const pruneExpired = (currentTime: number) => {
    for (const [id, claimedAt] of seenAt) if (currentTime - claimedAt >= options.ttlMs) seenAt.delete(id);

  };

  const evictOldest = () => {
    while (seenAt.size >= options.maxSize) {
      const oldest = seenAt.keys().next().value;
      if (oldest === undefined) return;
      seenAt.delete(oldest);
    }
  };

  const claim = (id: string): boolean => {
    const trimmed = id.trim();
    if (!trimmed) return true;

    const currentTime = now();
    pruneExpired(currentTime);

    const previous = seenAt.get(trimmed);
    if (previous !== undefined && currentTime - previous < options.ttlMs) return false;

    if (previous !== undefined) seenAt.delete(trimmed);

    evictOldest();
    seenAt.set(trimmed, currentTime);
    return true;
  };

  return {
    claim,
    clear: () => {
      seenAt.clear();
    },
    size: () => seenAt.size,
  };
};
