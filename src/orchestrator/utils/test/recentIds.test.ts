import { describe, expect, test } from "bun:test";

import { createRecentIdTracker } from "../recentIds";

describe("createRecentIdTracker", () => {
  test("accepts the first claim and rejects duplicates", () => {
    const tracker = createRecentIdTracker({
      ttlMs: 60_000,
      maxSize: 10,
      now: () => 1_000,
    });

    expect(tracker.claim("msg-1")).toBe(true);
    expect(tracker.claim("msg-1")).toBe(false);
    expect(tracker.size()).toBe(1);
  });

  test("allows reclaim after TTL expiry", () => {
    let currentTime = 1_000;
    const tracker = createRecentIdTracker({
      ttlMs: 500,
      maxSize: 10,
      now: () => currentTime,
    });

    expect(tracker.claim("msg-1")).toBe(true);

    currentTime = 1_499;
    expect(tracker.claim("msg-1")).toBe(false);

    currentTime = 1_500;
    expect(tracker.claim("msg-1")).toBe(true);
    expect(tracker.size()).toBe(1);
  });

  test("evicts oldest IDs when capacity is exceeded", () => {
    let currentTime = 1_000;
    const tracker = createRecentIdTracker({
      ttlMs: 60_000,
      maxSize: 2,
      now: () => currentTime,
    });

    expect(tracker.claim("a")).toBe(true);
    currentTime = 1_001;
    expect(tracker.claim("b")).toBe(true);
    currentTime = 1_002;
    expect(tracker.claim("c")).toBe(true);

    expect(tracker.size()).toBe(2);
    // "a" was evicted to make room for "c"
    expect(tracker.claim("a")).toBe(true);
    // "b" remains until another eviction; "c" is still retained
    expect(tracker.claim("c")).toBe(false);
  });

  test("treats blank IDs as always claimable", () => {
    const tracker = createRecentIdTracker({
      ttlMs: 60_000,
      maxSize: 10,
      now: () => 1_000,
    });

    expect(tracker.claim("")).toBe(true);
    expect(tracker.claim("   ")).toBe(true);
    expect(tracker.size()).toBe(0);
  });

  test("clear removes all claimed IDs", () => {
    const tracker = createRecentIdTracker({
      ttlMs: 60_000,
      maxSize: 10,
      now: () => 1_000,
    });

    expect(tracker.claim("msg-1")).toBe(true);
    tracker.clear();
    expect(tracker.size()).toBe(0);
    expect(tracker.claim("msg-1")).toBe(true);
  });
});
