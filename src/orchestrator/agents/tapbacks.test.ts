import { describe, expect, test } from "bun:test";

import { getTapbackOnlyRequest } from "./tapbacks";

describe("getTapbackOnlyRequest", () => {
  test.each([
    "can you react to this message",
    "Can you react to this message?",
    "can u react to this",
    "please react to my text",
    "tapback that message",
  ])("uses a like for %p", (text) => {
    expect(getTapbackOnlyRequest(text)).toBe("like");
  });

  test.each([
    ["react with love", "love"],
    ["react to this message with a heart", "love"],
    ["please react with thumbs up to this", "like"],
    ["tapback this text with dislike", "dislike"],
    ["can u react with laugh", "laugh"],
    ["react to this with an exclamation", "emphasize"],
    ["react with a question mark to this message", "question"],
  ] as const)("resolves %p to %p", (text, tapback) => {
    expect(getTapbackOnlyRequest(text)).toBe(tapback);
  });

  test.each([
    "how do reactions work",
    "react to this message and reply",
    "react with love and reply",
    "i reacted to this message",
    "please send a message",
  ])("leaves %p for the interaction agent", (text) => {
    expect(getTapbackOnlyRequest(text)).toBeUndefined();
  });
});
