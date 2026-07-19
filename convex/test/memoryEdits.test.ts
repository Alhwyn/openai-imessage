import { describe, expect, test } from "bun:test";

import {
  applyAdd,
  applyMemoryEditBody,
  applyRemove,
  applyReplace,
} from "../convex/lib/memoryEdits";

describe("applyAdd", () => {
  test("appends a new entry", () => {
    expect(applyAdd("a", "b", 100)).toBe("a\nb");
  });

  test("skips duplicates and empty text", () => {
    expect(applyAdd("hello", "hello", 100)).toBe("hello");
    expect(applyAdd("hello", "  ", 100)).toBe("hello");
  });

  test("enforces the character limit", () => {
    expect(() => applyAdd("abc", "def", 5)).toThrow("character limit");
  });
});

describe("applyReplace", () => {
  test("replaces the first match", () => {
    expect(applyReplace("foo bar foo", "foo", "baz", 100)).toBe("baz bar foo");
  });

  test("throws when old_text is missing", () => {
    expect(() => applyReplace("hello", "missing", "x", 100)).toThrow(
      "old_text not found",
    );
  });
});

describe("applyRemove", () => {
  test("removes all matches and collapses blank lines", () => {
    expect(applyRemove("a\n\n\nb\na", "a")).toBe("b");
  });
});

describe("applyMemoryEditBody", () => {
  test("dispatches discriminated edits", () => {
    expect(
      applyMemoryEditBody("", { action: "add", text: "note" }, 100),
    ).toBe("note");
    expect(
      applyMemoryEditBody("old", { action: "replace", oldText: "old", text: "new" }, 100),
    ).toBe("new");
    expect(
      applyMemoryEditBody("keep drop", { action: "remove", oldText: " drop" }, 100),
    ).toBe("keep");
  });
});
