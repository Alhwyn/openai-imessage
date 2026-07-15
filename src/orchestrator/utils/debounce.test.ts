import { describe, expect, test } from "bun:test";

import { buildDebouncedTurn } from "../bounce/index";

import { createKeyedDebounce } from "./debounce";
import { extractInboundText } from "./text";

describe("createKeyedDebounce", () => {
  test("coalesces rapid schedules into one flush", async () => {
    const flushed: string[] = [];

    const debounce = createKeyedDebounce<string>({
      delayMs: 40,
      onFlush: (_key: string, value: string) => {
        flushed.push(value);
      },
    });

    debounce.schedule("a", "one");
    debounce.schedule("a", "two");
    debounce.schedule("a", "three");

    await Bun.sleep(80);
    expect(flushed).toEqual(["three"]);
  });

  test("serializes overlapping flushes for the same key", async () => {
    const firstStarted = Promise.withResolvers<void>();
    const releaseFirst = Promise.withResolvers<void>();
    const secondFinished = Promise.withResolvers<void>();
    const events: string[] = [];
    let activeFlushes = 0;
    let maxActiveFlushes = 0;

    const debounce = createKeyedDebounce<string>({
      delayMs: 0,
      onFlush: async (_key, value) => {
        activeFlushes += 1;
        maxActiveFlushes = Math.max(maxActiveFlushes, activeFlushes);
        events.push(`start:${value}`);

        if (value === "first") {
          firstStarted.resolve();
          await releaseFirst.promise;
        }

        events.push(`end:${value}`);
        activeFlushes -= 1;

        if (value === "second") {
          secondFinished.resolve();
        }
      },
    });

    debounce.schedule("a", "first");
    await firstStarted.promise;

    debounce.schedule("a", "second");
    await Bun.sleep(10);
    expect(events).toEqual(["start:first"]);

    releaseFirst.resolve();
    await secondFinished.promise;

    expect(maxActiveFlushes).toBe(1);
    expect(events).toEqual(["start:first", "end:first", "start:second", "end:second"]);
  });
});

describe("buildDebouncedTurn", () => {
  test("stacks texts", () => {
    const space = { id: "space-1" } as never;
    const message = { id: "m1" } as never;

    const first = buildDebouncedTurn(undefined, {
      text: "hi",
      space,
      message,
    });
    const second = buildDebouncedTurn(first, {
      text: "there",
      space,
      message,
    });

    expect(second.texts).toEqual(["hi", "there"]);
  });
});

describe("extractInboundText", () => {
  test("reads text content", () => {
    const message = {
      content: { type: "text", text: " hello " },
    } as never;

    expect(extractInboundText(message)).toBe("hello");
  });
});
