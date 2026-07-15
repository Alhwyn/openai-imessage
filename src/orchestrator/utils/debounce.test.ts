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
