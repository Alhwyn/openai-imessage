import { describe, expect, test } from "bun:test";

import { isStoredHistoryMessage } from "../history";

describe("isStoredHistoryMessage", () => {
  test("accepts string and text-part messages", () => {
    expect(isStoredHistoryMessage({ role: "user", content: "hi" })).toBe(true);
    expect(
      isStoredHistoryMessage({
        role: "assistant",
        content: [{ type: "text", text: "yo" }],
      }),
    ).toBe(true);
  });

  test("rejects tool-call payloads that must not round-trip", () => {
    expect(
      isStoredHistoryMessage({
        role: "assistant",
        content: [{ type: "tool-call", toolName: "memory" }],
      }),
    ).toBe(false);
  });
});
