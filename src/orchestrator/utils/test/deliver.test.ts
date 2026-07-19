import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Emoji } from "@spectrum-ts/core";
import { describe, expect, mock, test } from "bun:test";

import { deliverOutbound } from "../deliver";

import type { ContentBuilder, Message, Space } from "@spectrum-ts/core";

const asSpace = (value: object): Space => value as Space;
const asMessage = (value: object): Message => value as Message;

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const withTempImages = async (
  count: number,
  fn: (paths: string[]) => Promise<void>,
): Promise<void> => {
  const tempDir = await mkdtemp(join(tmpdir(), "deliver-album-"));
  const paths: string[] = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const path = join(tempDir, `image-${index + 1}.png`);
      await Bun.write(path, PNG_BYTES);
      paths.push(path);
    }
    await fn(paths);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

const buildContent = async (value: unknown) => {
  const builder = value as ContentBuilder;
  return builder.build();
};

const firstArg = (fn: ReturnType<typeof mock>): unknown => {
  const calls = fn.mock.calls as unknown[][];
  return calls[0]?.[0];
};

const nthArg = (fn: ReturnType<typeof mock>, index: number): unknown => {
  const calls = fn.mock.calls as unknown[][];
  return calls[index]?.[0];
};

describe("deliverOutbound", () => {
  test("sends text via space.send when no target message", async () => {
    const send = mock(() => Promise.resolve(undefined));
    const space = asSpace({ send });

    await deliverOutbound(space, [{ kind: "text", text: "hello" }]);

    expect(send).toHaveBeenCalledTimes(1);
    const content = await buildContent(firstArg(send));
    expect(content).toEqual({ type: "text", text: "hello" });
  });

  test("sends text via space.send even when a target message is set", async () => {
    const reply = mock(() => Promise.resolve(undefined));
    const send = mock(() => Promise.resolve(undefined));
    const space = asSpace({ send });
    const targetMessage = asMessage({ reply });

    await deliverOutbound(space, [{ kind: "text", text: "chat" }], { targetMessage });

    expect(send).toHaveBeenCalledTimes(1);
    expect(reply).not.toHaveBeenCalled();
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

  test("sends a single attachment when album has one path", async () => {
    await withTempImages(1, async (paths) => {
      const send = mock(() => Promise.resolve(undefined));
      const space = asSpace({ send });

      await deliverOutbound(space, [{ kind: "album", paths }]);

      expect(send).toHaveBeenCalledTimes(1);
      const content = await buildContent(firstArg(send));
      expect(content.type).toBe("attachment");
    });
  });

  test("sends a grouped album when album has multiple paths", async () => {
    await withTempImages(3, async (paths) => {
      const send = mock(() => Promise.resolve(undefined));
      const space = asSpace({ send });

      await deliverOutbound(space, [{ kind: "album", paths }]);

      expect(send).toHaveBeenCalledTimes(1);
      const content = await buildContent(firstArg(send));
      expect(content.type).toBe("group");
      if (content.type !== "group") throw new Error("expected group content");

      expect(content.items.map((item) => item.content.type)).toEqual([
        "attachment",
        "attachment",
        "attachment",
      ]);
    });
  });

  test("sends album then suggestion text via space.send in order", async () => {
    await withTempImages(2, async (paths) => {
      const reply = mock(() => Promise.resolve(undefined));
      const send = mock(() => Promise.resolve(undefined));
      const space = asSpace({ send });
      const targetMessage = asMessage({ reply });

      await deliverOutbound(
        space,
        [
          { kind: "album", paths },
          { kind: "text", text: "want another angle" },
        ],
        { targetMessage },
      );

      expect(send).toHaveBeenCalledTimes(2);
      expect(reply).not.toHaveBeenCalled();

      const first = await buildContent(nthArg(send, 0));
      const second = await buildContent(nthArg(send, 1));
      expect(first.type).toBe("group");
      expect(second.type).toBe("text");
    });
  });

  test("sends app deep-link via space.send", async () => {
    const send = mock(() => Promise.resolve(undefined));
    const space = asSpace({ send });
    const url = "https://connect.composio.dev/link/ln_abc123";

    await deliverOutbound(space, [{ kind: "app", url }]);

    expect(send).toHaveBeenCalledTimes(1);
    const content = await buildContent(firstArg(send));
    expect(content.type).toBe("app");
    if (content.type !== "app") throw new Error("expected app content");

    expect(await content.url()).toBe(url);
  });

  test("sends computer links as live customized mini-app cards", async () => {
    const send = mock(() => Promise.resolve(undefined));
    const space = asSpace({ send });
    const url = "https://viewer.example.com/computer/task?token=secret";

    await deliverOutbound(space, [
      { kind: "app", presentation: "computer", url },
    ]);

    expect(send).toHaveBeenCalledTimes(1);
    expect((await buildContent(firstArg(send))) as unknown).toEqual({
      type: "customized-mini-app",
      __platform: "iMessage",
      appName: "Spectrum",
      appStoreId: 6777616651,
      extensionBundleId: "codes.photon.Spectrum.MessagesExtension",
      live: true,
      teamId: "P8XT6232SL",
      url,
      layout: {
        caption: "Computer use",
        subcaption: "Tap to watch live",
        summary: "Live computer use session",
      },
    });
  });

  test("sends app then instruction text via space.send in order", async () => {
    const send = mock(() => Promise.resolve(undefined));
    const space = asSpace({ send });
    const url = "https://connect.composio.dev/link/ln_abc123";

    await deliverOutbound(space, [
      { kind: "app", url },
      { kind: "text", text: "tap that to finish connecting gmail" },
    ]);

    expect(send).toHaveBeenCalledTimes(2);
    const first = await buildContent(nthArg(send, 0));
    const second = await buildContent(nthArg(send, 1));
    expect(first.type).toBe("app");
    expect(second).toEqual({
      type: "text",
      text: "tap that to finish connecting gmail",
    });
    if (first.type !== "app") throw new Error("expected app content");

    expect(await first.url()).toBe(url);
  });
});
