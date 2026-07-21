import { describe, expect, test } from "bun:test";

import { summarizeOutbound } from "../../outbound";

describe("summarizeOutbound", () => {
  test("summarizes plain app items by url instead of as reactions", () => {
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

  test("summarizes maps and computer mini-apps by presentation without url", () => {
    expect(
      summarizeOutbound([
        {
          kind: "app",
          presentation: "maps",
          url: "https://maps.example.com/maps/session?token=secret",
        },
        {
          kind: "app",
          presentation: "computer",
          url: "https://viewer.example.com/computer/task?token=secret",
        },
      ]),
    ).toEqual([
      { kind: "app", presentation: "maps" },
      { kind: "app", presentation: "computer" },
    ]);
  });

  test("summarizes background set and clear items", () => {
    expect(
      summarizeOutbound([
        { kind: "background", image: new Uint8Array([1, 2, 3]) },
        { kind: "background" },
      ]),
    ).toEqual([
      { kind: "background", bytes: 3 },
      { kind: "background", bytes: 0 },
    ]);
  });
});
