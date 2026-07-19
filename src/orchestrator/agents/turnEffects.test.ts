import { describe, expect, test } from "bun:test";

import { finalizeTurnOutbound } from "./turnEffects";

describe("finalizeTurnOutbound", () => {
  test("keeps only the latest tool text when model text is empty", () => {
    expect(
      finalizeTurnOutbound(
        [
          { kind: "text", text: "depends what it is, spill" },
          { kind: "text", text: "depends what it is, spill it" },
        ],
        "",
      ),
    ).toEqual([{ kind: "text", text: "depends what it is, spill it" }]);
  });

  test("preserves a reaction before the latest text reply", () => {
    expect(
      finalizeTurnOutbound(
        [
          { kind: "text", text: "first draft" },
          { kind: "reaction", emoji: "like" },
          { kind: "text", text: "final reply" },
        ],
        "",
      ),
    ).toEqual([
      { kind: "reaction", emoji: "like" },
      { kind: "text", text: "final reply" },
    ]);
  });

  test("model text wins over tool text", () => {
    expect(
      finalizeTurnOutbound(
        [
          { kind: "text", text: "draft" },
          {
            kind: "app",
            url: "https://connect.composio.dev/link/ln_abc123",
          },
        ],
        "tap that to finish connecting gmail",
      ),
    ).toEqual([
      {
        kind: "app",
        url: "https://connect.composio.dev/link/ln_abc123",
      },
      { kind: "text", text: "tap that to finish connecting gmail" },
    ]);
  });

  test("suppresses all text while preserving an app card", () => {
    expect(
      finalizeTurnOutbound(
        [
          { kind: "text", text: "starting the computer agent" },
          { kind: "app", url: "https://viewer.example.com/computer/task" },
        ],
        "i started it",
        true,
      ),
    ).toEqual([
      { kind: "app", url: "https://viewer.example.com/computer/task" },
    ]);
  });
});
