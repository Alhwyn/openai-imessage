import { describe, expect, test } from "bun:test";

import { coalesceTextReplies, summarizeOutbound } from "../outbound";

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

  test("preserves an app auth link with the latest text reply", () => {
    expect(
      coalesceTextReplies([
        { kind: "text", text: "draft" },
        {
          kind: "app",
          url: "https://connect.composio.dev/link/ln_abc123",
        },
        { kind: "text", text: "tap that to finish connecting gmail" },
      ]),
    ).toEqual([
      {
        kind: "app",
        url: "https://connect.composio.dev/link/ln_abc123",
      },
      { kind: "text", text: "tap that to finish connecting gmail" },
    ]);
  });
});

describe("summarizeOutbound", () => {
  test("summarizes app items by url instead of as reactions", () => {
    expect(
      summarizeOutbound([
        {
          kind: "app",
          url: "https://connect.composio.dev/link/ln_abc123",
        },
        { kind: "reaction", emoji: "like" },
      ]),
    ).toEqual([
      {
        kind: "app",
        url: "https://connect.composio.dev/link/ln_abc123",
      },
      { kind: "reaction", emoji: "like" },
    ]);
  });
});
