import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GMI_API_KEY } from "./llm";

import type {
  GeneratedImageAlbum,
  GenerateGmiImagesOptions,
  GmiImageResponse,
  ImageGenerationProgress,
  SeedreamImagePayload,
} from "./types";

export const GMI_IMAGE_API_BASE = "https://console.gmicloud.ai";
export const DEFAULT_GMI_IMAGE_MODEL = "seedream-5.0-pro";
export const GMI_IMAGE_MIN_COUNT = 1;
export const GMI_IMAGE_MAX_COUNT = 15;
export const GMI_IMAGE_TIMEOUT_MS = 120_000;
export const GMI_IMAGE_POLL_INTERVAL_MS = 2_000;
export const GMI_IMAGE_SIZE = "2K";
export const GMI_IMAGE_OUTPUT_FORMAT = "png";

const REQUESTS_URL = `${GMI_IMAGE_API_BASE}/api/v1/ie/requestqueue/apikey/requests`;

type WaitOptions = Required<
  Pick<GenerateGmiImagesOptions, "now" | "pollIntervalMs" | "sleep" | "timeoutMs">
>;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Returns the configured GMI image model id.
 */
export const getGmiImageModelId = (): string => {
  return process.env.GMI_IMAGE_MODEL?.trim() || DEFAULT_GMI_IMAGE_MODEL;
};

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
    REQUESTS_URL,
    {
      method: "POST",
      body: JSON.stringify({
        model: getGmiImageModelId(),
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

    const payload = await gmiFetchJson(`${REQUESTS_URL}/${requestId}`, { method: "GET" }, fetchFn);
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

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0) {
        throw new Error("Downloaded generated image was empty");
      }

      const path = join(tempDir, `image-${index + 1}.png`);
      await Bun.write(path, bytes);
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
 * One Seedream job per prompt, in parallel.
 */
export const generateGmiImages = async (
  prompts: string[],
  options: GenerateGmiImagesOptions = {},
): Promise<GeneratedImageAlbum> => {
  const cleaned = prompts.map((prompt) => prompt.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new Error("At least one image prompt is required");
  }

  const imagePrompts = cleaned.slice(0, GMI_IMAGE_MAX_COUNT);
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
    model: getGmiImageModelId(),
    count: imageCount,
    promptPreview: imagePrompts[0]?.slice(0, 120),
  });

  const startedAt = wait.now();
  reportProgress("queued");
  const mediaUrls = await Promise.all(
    imagePrompts.map(async (prompt) => {
      const url = await generateOneImageUrl(prompt, fetchFn, wait, reportProgress);
      completedImages += 1;
      reportProgress("processing");
      return url;
    }),
  );
  reportProgress("downloading");
  const album = await downloadAlbum(mediaUrls, fetchFn);

  console.log("[images] GMI image generation completed", {
    elapsedMs: wait.now() - startedAt,
    count: album.paths.length,
  });

  return album;
};
