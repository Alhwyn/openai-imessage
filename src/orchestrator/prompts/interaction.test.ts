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

describe("interaction prompt composio auth deep links", () => {
  test("requires send_auth_link instead of raw or Markdown OAuth URLs", () => {
    expect(interactionSystemPrompt).toContain("call send_auth_link with that exact URL");
    expect(interactionSystemPrompt).toContain(
      "Never paste the authorization URL into chat text",
    );
    expect(interactionSystemPrompt).toContain(
      "Never format it as Markdown like [label](url)",
    );
    expect(interactionSystemPrompt).toContain(
      'send_auth_link(url="https://connect.composio.dev/link/ln_abc123")',
    );
    expect(interactionSystemPrompt).not.toContain(
      "reply with that raw URL and a short instruction",
    );
  });
});
