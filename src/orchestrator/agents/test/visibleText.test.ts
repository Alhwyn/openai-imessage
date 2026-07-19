import { describe, expect, test } from "bun:test";

import { extractVisibleAssistantText } from "../visibleText";

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

  test("keeps normal unphased chat text", () => {
    expect(
      extractVisibleAssistantText(
        [{ type: "text", text: "bet, on it" }],
        "bet, on it",
      ),
    ).toBe("bet, on it");
  });

  test("falls back to raw text when content has no text parts", () => {
    expect(extractVisibleAssistantText([], "bet, on it")).toBe("bet, on it");
  });
});
