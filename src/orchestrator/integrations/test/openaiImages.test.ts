import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, mock, test } from "bun:test";
import sharp from "sharp";

import {
  IMAGE_MAX_COUNT,
  IMAGE_MAX_FILE_BYTES,
  IMAGE_MIN_COUNT,
  OPENAI_BASE_URL,
  OPENAI_IMAGE_MODEL_ID,
} from "../../utils/constants";
import {
  cleanupImageAlbum,
  clampImageCount,
  generateOpenAiImages,
} from "../openaiImages";

import type { ImageGenerationProgress } from "../../utils/types";

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

const SOURCE_B64 = Buffer.from(SOURCE_PNG).toString("base64");

const isJpeg = (bytes: Uint8Array): boolean =>
  bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const requestUrl = (input: string | URL | Request): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const requestBodyText = (body: unknown): string => {
  if (typeof body === "string") return body;
  return "";
};

describe("clampImageCount", () => {
  test("clamps into the supported range", () => {
    expect(clampImageCount(0)).toBe(IMAGE_MIN_COUNT);
    expect(clampImageCount(3.9)).toBe(3);
    expect(clampImageCount(99)).toBe(IMAGE_MAX_COUNT);
    expect(IMAGE_MAX_COUNT).toBe(3);
    expect(clampImageCount(Number.NaN)).toBe(IMAGE_MIN_COUNT);
  });
});

describe("OPENAI_IMAGE_MODEL_ID", () => {
  test("defaults to gpt-image-2", () => {
    expect(OPENAI_IMAGE_MODEL_ID).toBe("gpt-image-2");
  });
});

describe("cleanupImageAlbum", () => {
  test("removes a temp directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "openai-cleanup-"));
    const imagePath = join(tempDir, "image-1.png");
    await Bun.write(imagePath, SOURCE_PNG);

    await cleanupImageAlbum(tempDir);

    expect(await Bun.file(imagePath).exists()).toBe(false);
    expect(await Bun.file(tempDir).exists()).toBe(false);
  });
});

const TEST_API_KEY = "test-openai-key";

describe("generateOpenAiImages", () => {
  test("runs one OpenAI image request per prompt sequentially and stages JPEGs", async () => {
    let postCount = 0;
    const progress: ImageGenerationProgress[] = [];
    const fetchFn = mock(
      (input: string | URL | Request, init?: RequestInit) => {
        const url = requestUrl(input);
        expect(url).toBe(`${OPENAI_BASE_URL}/images/generations`);
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          Authorization: `Bearer ${TEST_API_KEY}`,
        });

        const body = JSON.parse(requestBodyText(init?.body)) as {
          model: string;
          prompt: string;
          n: number;
          size: string;
          output_format: string;
          quality: string;
          output_compression: number;
        };
        expect(body.model).toBe("gpt-image-2");
        expect(body.prompt).toBe("a fluffy cat");
        expect(body.n).toBe(1);
        expect(body.size).toBe("1280x1280");
        expect(body.output_format).toBe("jpeg");
        expect(body.quality).toBe("medium");
        expect(body.output_compression).toBe(80);

        postCount += 1;
        return Promise.resolve(
          jsonResponse({
            created: Date.now(),
            data: [{ b64_json: SOURCE_B64 }],
          }),
        );
      },
    );

    const album = await generateOpenAiImages(["a fluffy cat", "a fluffy cat"], {
      apiKey: TEST_API_KEY,
      fetchFn: fetchFn as unknown as typeof fetch,
      onProgress: (update) => {
        progress.push(update);
      },
    });

    expect(postCount).toBe(2);
    expect(progress).toEqual([
      { phase: "queued", completedImages: 0, totalImages: 2 },
      { phase: "processing", completedImages: 1, totalImages: 2 },
      { phase: "processing", completedImages: 2, totalImages: 2 },
      { phase: "downloading", completedImages: 2, totalImages: 2 },
    ]);
    expect(album.paths).toHaveLength(2);

    const first = await Bun.file(album.paths[0]!).bytes();
    const second = await Bun.file(album.paths[1]!).bytes();
    expect(isJpeg(first)).toBe(true);
    expect(isJpeg(second)).toBe(true);
    expect(first.byteLength).toBeLessThanOrEqual(IMAGE_MAX_FILE_BYTES);
    expect(second.byteLength).toBeLessThanOrEqual(IMAGE_MAX_FILE_BYTES);

    await cleanupImageAlbum(album.tempDir);
  });

  test("fails on provider failure without leaving temp files", async () => {
    const fetchFn = mock(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              message: "moderation blocked",
              code: "moderation_blocked",
            },
          },
          400,
        ),
      ),
    );

    try {
      await generateOpenAiImages(["bad prompt"], {
        apiKey: TEST_API_KEY,
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      throw new Error("expected generateOpenAiImages to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("moderation blocked");
    }
  });

  test("rejects invalid image bytes during staging", async () => {
    const fetchFn = mock(() =>
      Promise.resolve(
        jsonResponse({
          created: Date.now(),
          data: [
            {
              b64_json: Buffer.from([1, 2, 3, 4]).toString("base64"),
            },
          ],
        }),
      ),
    );

    try {
      await generateOpenAiImages(["bad bytes"], {
        apiKey: TEST_API_KEY,
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      throw new Error("expected generateOpenAiImages to reject bad image bytes");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("OPENAI_API_KEY");
    }
  });

  test("times out when the image request never completes", async () => {
    const fetchFn = mock((_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing abort signal"));
          return;
        }
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    try {
      await generateOpenAiImages(["slow prompt"], {
        apiKey: TEST_API_KEY,
        fetchFn: fetchFn as unknown as typeof fetch,
        timeoutMs: 20,
      });
      throw new Error("expected generateOpenAiImages to time out");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Image generation timed out");
    }
  });
});
