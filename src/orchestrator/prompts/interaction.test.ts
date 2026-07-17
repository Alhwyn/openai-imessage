import { describe, expect, test } from "bun:test";

import { interactionSystemPrompt } from "./index";

describe("interaction prompt rewrite formatting", () => {
  test("forbids emoji and Markdown in rewritten copy", () => {
    expect(interactionSystemPrompt).toContain(
      "For every cleanup or rewrite, remove all emoji unless the person explicitly asks to keep or add emoji.",
    );
    expect(interactionSystemPrompt).toContain(
      "For every cleanup or rewrite, remove all Markdown even when the source draft contains it.",
    );
    expect(interactionSystemPrompt).toContain(
      "Use blank lines, plain labels, and • bullets for real lists instead.",
    );
    expect(interactionSystemPrompt).toContain(
      "For an actual list, use plain-text bullet characters like • with one item per line.",
    );
  });
});
