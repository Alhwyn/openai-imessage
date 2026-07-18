import { describe, expect, test } from "bun:test";

import {
  getMessagePruneBatch,
  MESSAGE_PRUNE_BATCH_SIZE,
} from "../convex/lib/messageRetention";

describe("getMessagePruneBatch", () => {
  test("prunes every message older than the retention window in bounded batches", () => {
    const keep = 100;
    const original = Array.from({ length: 350 }, (_, index) => 350 - index);
    let retained = original;
    let batches = 0;

    while (true) {
      const batch = getMessagePruneBatch(
        retained.slice(0, keep + MESSAGE_PRUNE_BATCH_SIZE + 1),
        keep,
      );
      const deleted = new Set(batch.rows);
      retained = retained.filter((message) => !deleted.has(message));
      batches += 1;

      if (!batch.hasMore) break;
    }

    expect(batches).toBe(3);
    expect(retained).toEqual(original.slice(0, keep));
  });

  test("does not delete from a history within the retention window", () => {
    const retained = Array.from({ length: 100 }, (_, index) => index);

    expect(getMessagePruneBatch(retained, 100)).toEqual({
      hasMore: false,
      rows: [],
    });
  });
});
