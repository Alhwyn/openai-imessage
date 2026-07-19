import { describe, expect, test } from "bun:test";

import {
  extractVisibleAssistantText,
  looksLikeInternalPlanning,
} from "./visibleText";

describe("looksLikeInternalPlanning", () => {
  test("flags tool names and commentary leaks", () => {
    expect(
      looksLikeInternalPlanning(
        "We need answer latest image request needs call assign_image_task. But developer says immediately queues ack and don't text. Use commentary tool.",
      ),
    ).toBe(true);
    expect(looksLikeInternalPlanning("still cooking ur burrito pic")).toBe(
      false,
    );
  });
});

describe("extractVisibleAssistantText", () => {
  test("keeps only final_answer when phase metadata is present", () => {
    expect(
      extractVisibleAssistantText(
        [
          {
            type: "text",
            text: "planning assign_image_task now",
            providerMetadata: { openai: { phase: "commentary" } },
          },
          {
            type: "text",
            text: "bet, cooking a cat burrito",
            providerMetadata: { openai: { phase: "final_answer" } },
          },
        ],
        "planning assign_image_task nowbet, cooking a cat burrito",
      ),
    ).toBe("bet, cooking a cat burrito");
  });

  test("drops commentary-only responses", () => {
    expect(
      extractVisibleAssistantText(
        [
          {
            type: "text",
            text: "call assign_image_task, don't text, use commentary tool",
            providerMetadata: { openai: { phase: "commentary" } },
          },
        ],
        "call assign_image_task, don't text, use commentary tool",
      ),
    ).toBe("");
  });

  test("rejects unphased fallback that still looks like planning", () => {
    expect(
      extractVisibleAssistantText(
        [],
        "We need answer latest image request needs call assign_image_task. But developer says immediately queues ack and don't text. Use commentary tool.",
      ),
    ).toBe("");
  });

  test("keeps normal unphased chat text", () => {
    expect(
      extractVisibleAssistantText(
        [{ type: "text", text: "bet, on it" }],
        "bet, on it",
      ),
    ).toBe("bet, on it");
  });
});
