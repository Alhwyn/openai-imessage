import { describe, expect, test } from "bun:test";

import { buildDebouncedTurn } from "./inbound";

describe("buildDebouncedTurn", () => {
  test("stacks texts", () => {
    const space = { id: "space-1" } as never;
    const message = { id: "m1" } as never;

    const first = buildDebouncedTurn(undefined, {
      text: "hi",
      space,
      message,
      senderId: "sender-1",
    });
    const second = buildDebouncedTurn(first, {
      text: "there",
      space,
      message,
      senderId: "sender-1",
    });

    expect(second.texts).toEqual(["hi", "there"]);
  });

  test("stacks images across messages", () => {
    const space = { id: "space-1" } as never;
    const message = { id: "m1" } as never;
    const firstImage = {
      data: new Uint8Array([1]),
      filename: "first.png",
      mediaType: "image/png",
    };
    const secondImage = {
      data: new Uint8Array([2]),
      filename: "second.jpeg",
      mediaType: "image/jpeg",
    };

    const first = buildDebouncedTurn(undefined, {
      images: [firstImage],
      text: "",
      space,
      message,
      senderId: "sender-1",
    });
    const second = buildDebouncedTurn(first, {
      images: [secondImage],
      text: "compare these",
      space,
      message,
      senderId: "sender-1",
    });

    expect(second.images).toEqual([firstImage, secondImage]);
  });
});
