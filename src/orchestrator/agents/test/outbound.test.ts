import { describe, expect, test } from "bun:test";

import { summarizeOutbound } from "../outbound";

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
