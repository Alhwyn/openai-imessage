import { describe, expect, test } from "bun:test";

import { coalesceTextReplies } from "./outbound";

describe("coalesceTextReplies", () => {
  test("keeps only the latest text reply from one interaction turn", () => {
    expect(
      coalesceTextReplies([
        { kind: "text", text: "depends what it is, spill" },
        { kind: "text", text: "depends what it is, spill it" },
      ]),
    ).toEqual([{ kind: "text", text: "depends what it is, spill it" }]);
  });

  test("preserves a reaction before the latest text reply", () => {
    expect(
      coalesceTextReplies([
        { kind: "text", text: "first draft" },
        { kind: "reaction", emoji: "like" },
        { kind: "text", text: "final reply" },
      ]),
    ).toEqual([
      { kind: "reaction", emoji: "like" },
      { kind: "text", text: "final reply" },
    ]);
  });
});
