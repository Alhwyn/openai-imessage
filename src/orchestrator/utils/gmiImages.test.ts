import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  cleanupImageAlbum,
  clampImageCount,
  DEFAULT_GMI_IMAGE_MODEL,
  generateGmiImages,
  getGmiImageModelId,
  GMI_IMAGE_API_BASE,
  GMI_IMAGE_MAX_FILE_BYTES,
  GMI_IMAGE_MAX_COUNT,
  GMI_IMAGE_MIN_COUNT,
} from "./gmiImages";

import type { ImageGenerationProgress } from "./types";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

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

const noopSleep = (): Promise<void> => Promise.resolve();

afterEach(() => {
  delete process.env.GMI_IMAGE_MODEL;
});

describe("clampImageCount", () => {
  test("clamps into the supported range", () => {
    expect(clampImageCount(0)).toBe(GMI_IMAGE_MIN_COUNT);
    expect(clampImageCount(3.9)).toBe(3);
    expect(clampImageCount(99)).toBe(GMI_IMAGE_MAX_COUNT);
    expect(clampImageCount(Number.NaN)).toBe(GMI_IMAGE_MIN_COUNT);
  });
});

describe("getGmiImageModelId", () => {
  test("defaults to seedream-5.0-lite and honors GMI_IMAGE_MODEL", () => {
    expect(DEFAULT_GMI_IMAGE_MODEL).toBe("seedream-5.0-lite");
    expect(getGmiImageModelId()).toBe(DEFAULT_GMI_IMAGE_MODEL);
    process.env.GMI_IMAGE_MODEL = "custom-image-model";
    expect(getGmiImageModelId()).toBe("custom-image-model");
  });
});

describe("cleanupImageAlbum", () => {
  test("removes a temp directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "gmi-cleanup-"));
    const imagePath = join(tempDir, "image-1.png");
    await Bun.write(imagePath, PNG_BYTES);

    await cleanupImageAlbum(tempDir);

    expect(await Bun.file(imagePath).exists()).toBe(false);
    expect(await Bun.file(tempDir).exists()).toBe(false);
  });
});

describe("generateGmiImages", () => {
  test("runs one Seedream job per image sequentially, downloads urls, and stages files", async () => {
    let postCount = 0;
    const progress: ImageGenerationProgress[] = [];
    const fetchFn = mock(
      (input: string | URL | Request, init?: RequestInit) => {
        const url = requestUrl(input);

        if (
          url === `${GMI_IMAGE_API_BASE}/api/v1/ie/requestqueue/apikey/requests`
        ) {
          expect(init?.method).toBe("POST");
          const body = JSON.parse(requestBodyText(init?.body)) as {
            model: string;
            payload: {
              prompt: string;
              max_images: number;
              output_format: string;
              size: string;
              sequential_image_generation: string;
              watermark: boolean;
            };
          };
          expect(body.model).toBe("seedream-5.0-lite");
          expect(body.payload.prompt).toBe("a fluffy cat");
          expect(body.payload.max_images).toBe(1);
          expect(body.payload.size).toBe("2K");
          expect(body.payload.output_format).toBe("jpeg");
          expect(body.payload.sequential_image_generation).toBe("disabled");
          expect(body.payload.watermark).toBe(false);

          postCount += 1;
          const imageUrl =
            postCount === 1
              ? "https://cdn.example/a.png"
              : "https://cdn.example/b.png";
          return Promise.resolve(
            jsonResponse({
              request_id: `req-${postCount}`,
              status: "success",
              outcome: {
                media_urls: [{ id: "0", url: imageUrl }],
              },
            }),
          );
        }

        if (
          url === "https://cdn.example/a.png" ||
          url === "https://cdn.example/b.png"
        ) {
          return Promise.resolve(new Response(PNG_BYTES));
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    );

    const album = await generateGmiImages(["a fluffy cat", "a fluffy cat"], {
      fetchFn: fetchFn as unknown as typeof fetch,
      onProgress: (update) => {
        progress.push(update);
      },
      sleep: noopSleep,
    });

    expect(postCount).toBe(2);
    expect(progress).toEqual([
      { phase: "queued", completedImages: 0, totalImages: 2 },
      { phase: "processing", completedImages: 1, totalImages: 2 },
      { phase: "processing", completedImages: 2, totalImages: 2 },
      { phase: "downloading", completedImages: 2, totalImages: 2 },
    ]);
    expect(album.paths).toHaveLength(2);
    expect(await Bun.file(album.paths[0]!).bytes()).toEqual(PNG_BYTES);
    expect(await Bun.file(album.paths[1]!).bytes()).toEqual(PNG_BYTES);

    await cleanupImageAlbum(album.tempDir);
  });

  test("polls queued requests until success", async () => {
    let polls = 0;
    const fetchFn = mock((input: string | URL | Request) => {
      const url = requestUrl(input);

      if (
        url === `${GMI_IMAGE_API_BASE}/api/v1/ie/requestqueue/apikey/requests`
      ) {
        return Promise.resolve(
          jsonResponse({
            request_id: "req-queued",
            status: "queued",
          }),
        );
      }

      if (
        url ===
        `${GMI_IMAGE_API_BASE}/api/v1/ie/requestqueue/apikey/requests/req-queued`
      ) {
        polls += 1;
        if (polls === 1) {
          return Promise.resolve(
            jsonResponse({ request_id: "req-queued", status: "processing" }),
          );
        }

        return Promise.resolve(
          jsonResponse({
            request_id: "req-queued",
            status: "success",
            outcome: {
              media_urls: [{ id: "0", url: "https://cdn.example/one.png" }],
            },
          }),
        );
      }

      if (url === "https://cdn.example/one.png") {
        return Promise.resolve(new Response(PNG_BYTES));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const album = await generateGmiImages(["sunset"], {
      fetchFn: fetchFn as unknown as typeof fetch,
      pollIntervalMs: 1,
      sleep: noopSleep,
    });

    expect(polls).toBe(2);
    expect(album.paths).toHaveLength(1);
    await cleanupImageAlbum(album.tempDir);
  });

  test("fails on provider failure without leaving temp files", async () => {
    const fetchFn = mock(() =>
      Promise.resolve(
        jsonResponse({
          request_id: "req-fail",
          status: "failed",
          error: { message: "moderation blocked" },
        }),
      ),
    );

    try {
      await generateGmiImages(["bad prompt"], {
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: noopSleep,
      });
      throw new Error("expected generateGmiImages to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("moderation blocked");
    }
  });

  test("rejects generated images larger than 10 MiB", async () => {
    const fetchFn = mock((input: string | URL | Request) => {
      const url = requestUrl(input);
      if (
        url === `${GMI_IMAGE_API_BASE}/api/v1/ie/requestqueue/apikey/requests`
      ) {
        return Promise.resolve(
          jsonResponse({
            request_id: "req-oversized",
            status: "success",
            outcome: {
              media_urls: [{ id: "0", url: "https://cdn.example/oversized.jpeg" }],
            },
          }),
        );
      }

      if (url === "https://cdn.example/oversized.jpeg") {
        return Promise.resolve(
          new Response(new Uint8Array(GMI_IMAGE_MAX_FILE_BYTES + 1)),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    try {
      await generateGmiImages(["oversized image"], {
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: noopSleep,
      });
      throw new Error("expected generateGmiImages to reject an oversized image");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "exceeds the 10 MiB upload limit",
      );
    }
  });

  test("times out while still queued", async () => {
    let now = 0;
    const fetchFn = mock((input: string | URL | Request) => {
      const url = requestUrl(input);
      if (
        url === `${GMI_IMAGE_API_BASE}/api/v1/ie/requestqueue/apikey/requests`
      ) {
        return Promise.resolve(
          jsonResponse({
            request_id: "req-slow",
            status: "queued",
          }),
        );
      }

      return Promise.resolve(
        jsonResponse({
          request_id: "req-slow",
          status: "processing",
        }),
      );
    });

    try {
      await generateGmiImages(["slow prompt"], {
        fetchFn: fetchFn as unknown as typeof fetch,
        now: () => {
          now += 50;
          return now;
        },
        pollIntervalMs: 1,
        timeoutMs: 100,
        sleep: noopSleep,
      });
      throw new Error("expected generateGmiImages to time out");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Image generation timed out");
    }
  });
});
