import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import {
  GMI_API_KEY,
  GMI_IMAGE_MAX_COUNT,
  GMI_IMAGE_MAX_FILE_BYTES,
  GMI_IMAGE_MIN_COUNT,
  GMI_IMAGE_MODEL_ID,
  GMI_IMAGE_OUTPUT_FORMAT,
  GMI_IMAGE_POLL_INTERVAL_MS,
  GMI_IMAGE_REQUESTS_URL,
  GMI_IMAGE_SIZE,
  GMI_IMAGE_TIMEOUT_MS,
} from "../utils/constants";

import type {
  GeneratedImageAlbum,
  GenerateGmiImagesOptions,
  GmiImageResponse,
  ImageGenerationProgress,
  SeedreamImagePayload,
} from "../utils/types";

type WaitOptions = Required<
  Pick<GenerateGmiImagesOptions, "now" | "pollIntervalMs" | "sleep" | "timeoutMs">
>;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Clamps a requested image count into the Seedream-supported range.
 */
export const clampImageCount = (count: number): number => {
  if (!Number.isFinite(count)) return GMI_IMAGE_MIN_COUNT;
  return Math.min(
    GMI_IMAGE_MAX_COUNT,
    Math.max(GMI_IMAGE_MIN_COUNT, Math.trunc(count)),
  );
};

/**
 * Removes a temporary album directory created for generated images.
 */
export const cleanupImageAlbum = async (tempDir: string | undefined): Promise<void> => {
  if (!tempDir) return;
  await rm(tempDir, { recursive: true, force: true });
};

const resolveWaitOptions = (options: GenerateGmiImagesOptions): WaitOptions => ({
  now: options.now ?? Date.now,
  pollIntervalMs: options.pollIntervalMs ?? GMI_IMAGE_POLL_INTERVAL_MS,
  sleep: options.sleep ?? defaultSleep,
  timeoutMs: options.timeoutMs ?? GMI_IMAGE_TIMEOUT_MS,
});

const errorMessage = (payload: GmiImageResponse): string => {
  const { error } = payload;
  if (typeof error === "string") return error.trim() || "Image generation failed";
  return error?.message?.trim() || "Image generation failed";
};

const mediaUrlsFrom = (payload: GmiImageResponse): string[] => {
  const urls: string[] = [];
  for (const entry of payload.outcome?.media_urls ?? []) {
    const url = entry.url?.trim();
    if (url) urls.push(url);
  }
  return urls;
};

const parseResponse = async (response: Response): Promise<GmiImageResponse> => {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`GMI image API returned empty body (HTTP ${response.status})`);
  }

  try {
    return JSON.parse(text) as GmiImageResponse;
  } catch {
    throw new Error(`GMI image API returned non-JSON body (HTTP ${response.status})`);
  }
};

const gmiFetchJson = async (
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
): Promise<GmiImageResponse> => {
  const response = await fetchFn(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${GMI_API_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(`${errorMessage(payload)} (HTTP ${response.status})`);
  }
  return payload;
};

/** One image per request — Seedream `auto`/`max_images` is a soft ceiling, not a hard count. */
const seedreamPayload = (prompt: string): SeedreamImagePayload => ({
  prompt,
  size: GMI_IMAGE_SIZE,
  output_format: GMI_IMAGE_OUTPUT_FORMAT,
  max_images: 1,
  sequential_image_generation: "disabled",
  watermark: false,
});

const submitImageRequest = (
  prompt: string,
  fetchFn: typeof fetch,
): Promise<GmiImageResponse> =>
  gmiFetchJson(
    GMI_IMAGE_REQUESTS_URL,
    {
      method: "POST",
      body: JSON.stringify({
        model: GMI_IMAGE_MODEL_ID,
        payload: seedreamPayload(prompt),
      }),
    },
    fetchFn,
  );

const awaitImageResult = async (
  initial: GmiImageResponse,
  fetchFn: typeof fetch,
  options: WaitOptions,
  onStatus: (status: "queued" | "processing") => void,
): Promise<GmiImageResponse> => {
  const initialStatus = initial.status?.toLowerCase();
  if (initialStatus === "success") return initial;
  if (initialStatus === "failed") throw new Error(errorMessage(initial));
  onStatus(initialStatus === "processing" ? "processing" : "queued");

  const requestId = initial.request_id?.trim();
  if (!requestId) {
    throw new Error("GMI image API did not return a request_id to poll");
  }

  const deadline = options.now() + options.timeoutMs;
  while (options.now() < deadline) {
    await options.sleep(options.pollIntervalMs);

    const payload = await gmiFetchJson(`${GMI_IMAGE_REQUESTS_URL}/${requestId}`, { method: "GET" }, fetchFn);
    const status = payload.status?.toLowerCase();
    if (status === "success") return payload;
    if (status === "failed") throw new Error(errorMessage(payload));
    onStatus(status === "processing" ? "processing" : "queued");
  }

  throw new Error("Image generation timed out");
};

const generateOneImageUrl = async (
  prompt: string,
  fetchFn: typeof fetch,
  wait: WaitOptions,
  onStatus: (status: "queued" | "processing") => void,
): Promise<string> => {
  const submitted = await submitImageRequest(prompt, fetchFn);
  const completed = await awaitImageResult(submitted, fetchFn, wait, onStatus);
  const [url] = mediaUrlsFrom(completed);
  if (!url) {
    throw new Error("GMI image API returned no media URLs");
  }
  return url;
};

const downloadAlbum = async (
  urls: string[],
  fetchFn: typeof fetch,
): Promise<GeneratedImageAlbum> => {
  const tempDir = await mkdtemp(join(tmpdir(), "gmi-images-"));
  const paths: string[] = [];

  try {
    for (const [index, url] of urls.entries()) {
      const response = await fetchFn(url);
      if (!response.ok) {
        throw new Error(`Failed to download generated image (HTTP ${response.status})`);
      }

      const bytes = new Uint8Array(
        await sharp(await response.arrayBuffer())
          .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer(),
      );
      if (bytes.byteLength === 0) throw new Error("Downloaded generated image was empty");

      if (bytes.byteLength > GMI_IMAGE_MAX_FILE_BYTES) throw new Error(`Staged image too large (${(bytes.byteLength / 1_048_576).toFixed(2)} MiB)`);

      const path = join(tempDir, `image-${index + 1}.jpeg`);
      await Bun.write(path, bytes);
      console.log("[images] Staged generated image", {
        index: index + 1,
        bytes: bytes.byteLength,
        mebibytes: Number((bytes.byteLength / 1_048_576).toFixed(2)),
      });
      paths.push(path);
    }

    return { paths, tempDir };
  } catch (error) {
    await cleanupImageAlbum(tempDir);
    throw error;
  }
};

/**
 * Generates images via Seedream on GMI, polls when queued, and stages files locally.
 * One Seedream job per prompt, processed sequentially to limit peak memory.
 */
export const generateGmiImages = async (
  prompts: string[],
  options: GenerateGmiImagesOptions = {},
): Promise<GeneratedImageAlbum> => {
  const cleaned = prompts.map((prompt) => prompt.trim()).filter(Boolean);
  
  if (cleaned.length === 0) throw new Error("At least one image prompt is required");

  const imagePrompts = cleaned.slice(0, clampImageCount(cleaned.length));
  const imageCount = imagePrompts.length;
  const fetchFn = options.fetchFn ?? fetch;
  const wait = resolveWaitOptions(options);
  let completedImages = 0;
  const reportProgress = (phase: ImageGenerationProgress["phase"]): void => {
    options.onProgress?.({
      phase,
      completedImages,
      totalImages: imageCount,
    });
  };

  console.log("[images] Starting GMI image generation", {
    model: GMI_IMAGE_MODEL_ID,
    count: imageCount,
    promptPreview: imagePrompts[0]?.slice(0, 120),
  });

  const startedAt = wait.now();
  reportProgress("queued");
  const mediaUrls: string[] = [];
  for (const prompt of imagePrompts) {
    const url = await generateOneImageUrl(prompt, fetchFn, wait, reportProgress);
    mediaUrls.push(url);
    completedImages += 1;
    reportProgress("processing");
  }
  reportProgress("downloading");
  const album = await downloadAlbum(mediaUrls, fetchFn);

  console.log("[images] GMI image generation completed", {
    elapsedMs: wait.now() - startedAt,
    count: album.paths.length,
  });

  return album;
};
