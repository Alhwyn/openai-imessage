import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import {
  IMAGE_MAX_COUNT,
  IMAGE_MAX_FILE_BYTES,
  IMAGE_MIN_COUNT,
  OPENAI_IMAGE_MODEL_ID,
  OPENAI_IMAGE_OUTPUT_COMPRESSION,
  OPENAI_IMAGE_OUTPUT_FORMAT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
  OPENAI_IMAGE_TIMEOUT_MS,
} from "../utils/constants";
import { getOpenAiApiKey, getOpenAiBaseUrl } from "../utils/openaiEnv";

import type {
  GeneratedImageAlbum,
  GenerateImagesOptions,
  ImageGenerationProgress,
  OpenAiImagesResponse,
} from "../utils/types";

/**
 * Clamps a requested image count into the supported range.
 */
export const clampImageCount = (count: number): number => {
  if (!Number.isFinite(count)) return IMAGE_MIN_COUNT;
  return Math.min(
    IMAGE_MAX_COUNT,
    Math.max(IMAGE_MIN_COUNT, Math.trunc(count)),
  );
};

/**
 * Removes a temporary album directory created for generated images.
 */
export const cleanupImageAlbum = async (
  tempDir: string | undefined,
): Promise<void> => {
  if (!tempDir) return;
  await rm(tempDir, { recursive: true, force: true });
};

const errorMessage = (payload: OpenAiImagesResponse): string => {
  return payload.error?.message?.trim() || "Image generation failed";
};

const parseResponse = async (
  response: Response,
): Promise<OpenAiImagesResponse> => {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      `OpenAI image API returned empty body (HTTP ${response.status})`,
    );
  }

  try {
    return JSON.parse(text) as OpenAiImagesResponse;
  } catch {
    throw new Error(
      `OpenAI image API returned non-JSON body (HTTP ${response.status})`,
    );
  }
};

const generateOneImageB64 = async (
  prompt: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<Uint8Array> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchFn(
      `${getOpenAiBaseUrl()}/images/generations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getOpenAiApiKey("generating images")}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: OPENAI_IMAGE_MODEL_ID,
          prompt,
          n: 1,
          size: OPENAI_IMAGE_SIZE,
          output_format: OPENAI_IMAGE_OUTPUT_FORMAT,
          output_compression: OPENAI_IMAGE_OUTPUT_COMPRESSION,
          quality: OPENAI_IMAGE_QUALITY,
        }),
      },
    );

    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new Error(`${errorMessage(payload)} (HTTP ${response.status})`);
    }

    const encoded = payload.data?.[0]?.b64_json?.trim();
    if (!encoded) {
      throw new Error("OpenAI image API returned no image data");
    }

    return new Uint8Array(Buffer.from(encoded, "base64"));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Image generation timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const stageAlbum = async (images: Uint8Array[]): Promise<GeneratedImageAlbum> => {
  const tempDir = await mkdtemp(join(tmpdir(), "openai-images-"));
  const paths: string[] = [];

  try {
    for (const [index, bytes] of images.entries()) {
      const staged = new Uint8Array(
        await sharp(bytes)
          .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer(),
      );
      if (staged.byteLength === 0) {
        throw new Error("Generated image was empty after staging");
      }
      if (staged.byteLength > IMAGE_MAX_FILE_BYTES) {
        throw new Error(
          `Staged image too large (${(staged.byteLength / 1_048_576).toFixed(2)} MiB)`,
        );
      }

      const path = join(tempDir, `image-${index + 1}.jpeg`);
      await Bun.write(path, staged);
      console.log("[images] Staged generated image", {
        index: index + 1,
        bytes: staged.byteLength,
        mebibytes: Number((staged.byteLength / 1_048_576).toFixed(2)),
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
 * Generates images via OpenAI GPT Image, then stages JPEG files locally.
 * One generation request per prompt, processed sequentially to limit peak memory.
 */
export const generateOpenAiImages = async (
  prompts: string[],
  options: GenerateImagesOptions = {},
): Promise<GeneratedImageAlbum> => {
  const cleaned = prompts.map((prompt) => prompt.trim()).filter(Boolean);
  if (cleaned.length === 0) throw new Error("At least one image prompt is required");

  const imagePrompts = cleaned.slice(0, clampImageCount(cleaned.length));
  const imageCount = imagePrompts.length;
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? OPENAI_IMAGE_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  let completedImages = 0;
  const reportProgress = (phase: ImageGenerationProgress["phase"]): void => {
    options.onProgress?.({
      phase,
      completedImages,
      totalImages: imageCount,
    });
  };

  console.log("[images] Starting OpenAI image generation", {
    model: OPENAI_IMAGE_MODEL_ID,
    count: imageCount,
    promptPreview: imagePrompts[0]?.slice(0, 120),
  });

  const startedAt = now();
  reportProgress("queued");
  const images: Uint8Array[] = [];
  for (const prompt of imagePrompts) {
    const bytes = await generateOneImageB64(prompt, fetchFn, timeoutMs);
    images.push(bytes);
    completedImages += 1;
    reportProgress("processing");
  }
  reportProgress("downloading");
  const album = await stageAlbum(images);

  console.log("[images] OpenAI image generation completed", {
    elapsedMs: now() - startedAt,
    count: album.paths.length,
  });

  return album;
};
