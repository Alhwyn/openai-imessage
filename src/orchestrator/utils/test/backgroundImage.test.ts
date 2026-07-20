import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { toBackgroundJpeg } from "../backgroundImage";

const SOURCE_PNG = await sharp({
  create: {
    width: 64,
    height: 64,
    channels: 3,
    background: { r: 40, g: 120, b: 200 },
  },
})
  .png()
  .toBuffer();

const isJpeg = (bytes: Uint8Array): boolean =>
  bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;

describe("toBackgroundJpeg", () => {
  test("converts png and webp to jpeg", async () => {
    const fromPng = await toBackgroundJpeg(new Uint8Array(SOURCE_PNG));
    expect(isJpeg(fromPng)).toBe(true);

    const webp = new Uint8Array(await sharp(SOURCE_PNG).webp().toBuffer());
    expect(isJpeg(await toBackgroundJpeg(webp))).toBe(true);
  });

  test("rejects empty bytes", async () => {
    try {
      await toBackgroundJpeg(new Uint8Array());
      throw new Error("expected toBackgroundJpeg to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Background image was empty");
    }
  });
});
