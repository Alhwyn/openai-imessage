import { describe, expect, test } from "bun:test";

import { resolveSenderAddress } from "../utils";

import type { Message, Space } from "@spectrum-ts/core";

const makeSpace = (): Space =>
  ({
    id: "any;-;+15559876543",
    __platform: "iMessage",
    phone: "+15551234567",
    type: "dm",
  }) as unknown as Space;

const makeMessage = (senderId: string | null, address?: string): Message =>
  ({
    id: "msg-1",
    platform: "iMessage",
    direction: "inbound",
    sender: senderId
      ? {
        id: senderId,
        __platform: "iMessage",
        ...(address ? { address } : {}),
      }
      : undefined,
    space: makeSpace(),
  }) as unknown as Message;

describe("resolveSenderAddress", () => {
  test("prefers iMessage address extra over id", () => {
    expect(
      resolveSenderAddress(makeMessage("+15551111111", "+15552222222"), null),
    ).toBe("+15552222222");
  });

  test("falls back to sender id and then senderId arg", () => {
    expect(resolveSenderAddress(makeMessage("+15551111111"), null)).toBe(
      "+15551111111",
    );
    expect(resolveSenderAddress(makeMessage(null), "+15553333333")).toBe(
      "+15553333333",
    );
  });
});
