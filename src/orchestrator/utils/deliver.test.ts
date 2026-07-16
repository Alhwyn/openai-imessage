import { Emoji } from "@spectrum-ts/core";
import { describe, expect, mock, test } from "bun:test";

import { deliverOutbound, deliverReplies } from "./deliver";

import type { Message, Space } from "@spectrum-ts/core";

const asSpace = (value: object): Space => value as Space;
const asMessage = (value: object): Message => value as Message;

describe("deliverOutbound", () => {
  test("sends text via space.send when no target message", async () => {
    const send = mock(() => Promise.resolve(undefined));
    const space = asSpace({ send });

    await deliverOutbound(space, [{ kind: "text", text: "hello" }]);

    expect(send).toHaveBeenCalledTimes(1);
  });

  test("threads text via message.reply when target is set", async () => {
    const reply = mock(() => Promise.resolve(undefined));
    const send = mock(() => Promise.resolve(undefined));
    const space = asSpace({ send });
    const targetMessage = asMessage({ reply });

    await deliverOutbound(space, [{ kind: "text", text: "threaded" }], { targetMessage });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  test("reacts via message.react", async () => {
    const react = mock(() => Promise.resolve(undefined));
    const space = asSpace({ send: mock(() => Promise.resolve(undefined)) });
    const targetMessage = asMessage({ react });

    await deliverOutbound(space, [{ kind: "reaction", emoji: "laugh" }], { targetMessage });

    expect(react).toHaveBeenCalledWith(Emoji.laugh);
  });

  test("skips reaction when no target message", async () => {
    const send = mock(() => Promise.resolve(undefined));
    const space = asSpace({ send });

    await deliverOutbound(space, [{ kind: "reaction", emoji: "love" }]);

    expect(send).not.toHaveBeenCalled();
  });
});

describe("deliverReplies", () => {
  test("maps string replies to space.send", async () => {
    const send = mock(() => Promise.resolve(undefined));
    const space = asSpace({ send });

    await deliverReplies(space, ["one", "two"]);

    expect(send).toHaveBeenCalledTimes(2);
  });
});
