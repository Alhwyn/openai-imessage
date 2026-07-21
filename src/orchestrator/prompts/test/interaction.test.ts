import { describe, expect, test } from "bun:test";

import { interactionSystemPrompt } from "../index";

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
    expect(interactionSystemPrompt).toContain(
      "Never wrap words in ** for bold",
    );
    expect(interactionSystemPrompt).toContain(
      "Wrong: The answer was **CHURN**. Right: The answer was CHURN.",
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

describe("interaction prompt conversation history", () => {
  test("treats recent history as already injected", () => {
    expect(interactionSystemPrompt).toContain(
      "Recent conversation history is already included in the message list",
    );
    expect(interactionSystemPrompt).toContain(
      "After the person says they finished connecting, immediately retry the original connected-app request with Composio tools",
    );
    expect(interactionSystemPrompt).not.toContain("get_conversation_history");
  });
});

describe("interaction prompt computer use", () => {
  test("routes full desktop work through durable computer tools", () => {
    expect(interactionSystemPrompt).toContain(
      "Use assign_computer_task whenever the person wants something done in a real browser or desktop GUI",
    );
    expect(interactionSystemPrompt).toContain(
      "use Google Chrome or other desktop apps",
    );
    expect(interactionSystemPrompt).toContain(
      "always call get_computer_task_status",
    );
    expect(interactionSystemPrompt).toContain(
      "do not pretend Wordle/browser work succeeded",
    );
    expect(interactionSystemPrompt).toContain(
      "Never use Composio for opening websites, browser games, Wordle/Worldle",
    );
    expect(interactionSystemPrompt).toContain(
      "open worlds and solve the world of the day",
    );
  });
});

describe("interaction prompt user-facing voice", () => {
  test("forbids narrating tools or commentary to the person", () => {
    expect(interactionSystemPrompt).toContain(
      "User-facing text is only what a normal friend would say in iMessage",
    );
    expect(interactionSystemPrompt).toContain(
      'Never write scratch notes, chain-of-thought, or tool-selection reasoning into the message',
    );
    expect(interactionSystemPrompt).toContain("use commentary");
  });

  test("forbids explaining memory/pipeline internals", () => {
    expect(interactionSystemPrompt).toContain(
      "Never explain how you work under the hood",
    );
    expect(interactionSystemPrompt).toContain(
      "Never explain memory mechanics",
    );
    expect(interactionSystemPrompt).toContain(
      "there's a background pipeline that parses our chats",
    );
  });
});

describe("interaction prompt chat background", () => {
  test("routes wallpaper changes through set_chat_background", () => {
    expect(interactionSystemPrompt).toContain(
      "Use set_chat_background for chat wallpaper",
    );
    expect(interactionSystemPrompt).toContain(
      'set_chat_background(source="prompt", prompt="misty forest at dusk, soft wallpaper")',
    );
    expect(interactionSystemPrompt).toContain(
      'set_chat_background(source="attachment")',
    );
  });
});

describe("interaction prompt location discovery", () => {
  test("asks for city, uses Exa, and delivers live map mini-app card", () => {
    expect(interactionSystemPrompt).toContain(
      "ask for a city, neighborhood, or specific place name",
    );
    expect(interactionSystemPrompt).toContain(
      "Do not use Find My for place search",
    );
    expect(interactionSystemPrompt).not.toContain("call get_my_location first");
    expect(interactionSystemPrompt).toContain(
      "Do not call get_my_location or request_my_location",
    );
    expect(interactionSystemPrompt).toContain(
      "Never pass latitude/longitude to search_nearby_places",
    );
    expect(interactionSystemPrompt).toContain(
      "Every place claim must come from search_nearby_places results",
    );
    expect(interactionSystemPrompt).toContain(
      "end with a Sources section listing those evidence URLs",
    );
    expect(interactionSystemPrompt).toContain(
      'search_nearby_places(subject="parks with peacocks", searchArea="Victoria, BC")',
    );
    expect(interactionSystemPrompt).toContain(
      "Prefer full phrases over keyword stuffing",
    );
    expect(interactionSystemPrompt).toContain(
      "call search_nearby_places again with a differently phrased subject",
    );
    expect(interactionSystemPrompt).toContain(
      "create_directions_link delivers the live map mini-app card",
    );
    expect(interactionSystemPrompt).toContain(
      "so a Spectrum mini-app live map card is delivered",
    );
    expect(interactionSystemPrompt).toContain(
      "Do not invent destinations. Do not build map URLs by hand",
    );
    expect(interactionSystemPrompt).toContain(
      "Never paste Google Maps or hosted map URLs into chat text",
    );
    expect(interactionSystemPrompt).toContain(
      "whose blue-dot and route use Find My sharing",
    );
    expect(interactionSystemPrompt).toContain(
      'create_directions_link(destination="Beacon Hill Park", searchArea="Victoria, BC")',
    );
  });
});
