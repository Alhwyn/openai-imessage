import { describe, expect, test } from "bun:test";

import { createKeyedDebounce } from "../debounce";
import { extractInboundImages, extractInboundText } from "../text";

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

        if (value === "second") secondFinished.resolve();

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

  test("surfaces flush failures through onError", async () => {
    const failures: string[] = [];
    const debounce = createKeyedDebounce<string>({
      delayMs: 0,
      onFlush: () => {
        throw new Error("flush broke");
      },
      onError: (_key, value, error) => {
        failures.push(`${value}:${error instanceof Error ? error.message : String(error)}`);
      },
    });

    debounce.schedule("a", "message");
    await debounce.flushAll();

    expect(failures).toEqual(["message:flush broke"]);
  });

  test("flushAll drains every pending key", async () => {
    const flushed: string[] = [];
    const debounce = createKeyedDebounce<string>({
      delayMs: 60_000,
      onFlush: (key, value) => {
        flushed.push(`${key}:${value}`);
      },
    });

    debounce.schedule("a", "one");
    debounce.schedule("b", "two");
    await debounce.flushAll();

    expect(flushed.sort()).toEqual(["a:one", "b:two"]);
  });
});

describe("extractInboundText", () => {
  test("reads text content", () => {
    const message = {
      content: { type: "text", text: " hello " },
    } as never;

    expect(extractInboundText(message)).toBe("hello");
  });

  test("reads supported image attachments", async () => {
    const message = {
      content: {
        type: "attachment",
        name: "photo.jpg",
        mimeType: "image/jpg; charset=binary",
        read: () => Promise.resolve(Buffer.from([1, 2, 3])),
      },
    } as never;

    expect(await extractInboundImages(message)).toEqual([
      {
        data: new Uint8Array([1, 2, 3]),
        filename: "photo.jpg",
        mediaType: "image/jpeg",
      },
    ]);
  });

  test("ignores unsupported attachment formats", async () => {
    const message = {
      content: {
        type: "attachment",
        name: "photo.heic",
        mimeType: "image/heic",
        read: () => Promise.resolve(Buffer.from([1, 2, 3])),
      },
    } as never;

    expect(await extractInboundImages(message)).toEqual([]);
  });

  test("reads captions and multiple images from grouped content", async () => {
    const message = {
      content: {
        type: "group",
        items: [
          { content: { type: "text", text: " compare these " } },
          {
            content: {
              type: "attachment",
              name: "first.png",
              mimeType: "image/png",
              read: () => Promise.resolve(Buffer.from([1])),
            },
          },
          {
            content: {
              type: "attachment",
              name: "second.webp",
              mimeType: "image/webp",
              read: () => Promise.resolve(Buffer.from([2])),
            },
          },
        ],
      },
    } as never;

    expect(extractInboundText(message)).toBe("compare these");
    expect(await extractInboundImages(message)).toEqual([
      {
        data: new Uint8Array([1]),
        filename: "first.png",
        mediaType: "image/png",
      },
      {
        data: new Uint8Array([2]),
        filename: "second.webp",
        mediaType: "image/webp",
      },
    ]);
  });
});
