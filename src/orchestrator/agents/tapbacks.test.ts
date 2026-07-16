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
    "how do reactions work",
    "react to this message and reply",
    "i reacted to this message",
    "please send a message",
  ])("leaves %p for the interaction agent", (text) => {
    expect(getTapbackOnlyRequest(text)).toBeUndefined();
  });
});
