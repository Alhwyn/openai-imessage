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

  test("non_text_only keeps app card and drops all text", () => {
    expect(
      finalizeTurnOutbound(
        [
          { kind: "text", text: "starting the computer agent" },
          { kind: "app", url: "https://viewer.example.com/computer/task" },
        ],
        "i started it",
        "non_text_only",
      ),
    ).toEqual([
      { kind: "app", url: "https://viewer.example.com/computer/task" },
    ]);
  });

  test("tools_only keeps tool ack and drops model text", () => {
    expect(
      finalizeTurnOutbound(
        [{ kind: "text", text: "bet cooking that, ~20 sec" }],
        "call assign_image_task and don't text",
        "tools_only",
      ),
    ).toEqual([{ kind: "text", text: "bet cooking that, ~20 sec" }]);
  });
});
