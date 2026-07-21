import type { Message } from "@spectrum-ts/core";

/** A keyed debounce options. */
export type KeyedDebounceOptions<T> = {
  delayMs: number | (() => number);
  onFlush: (key: string, value: T) => void | Promise<void>;
  onError?: (key: string, value: T, error: unknown) => void | Promise<void>;
};

/** A keyed debounce. */
export type KeyedDebounce<T> = {
  schedule: (key: string, value: T) => void;
  flush: (key: string) => Promise<void>;
  flushAll: () => Promise<void>;
  cancel: (key: string) => void;
  cancelAll: () => void;
};

/** When set, reactions target this message. Text/albums always use space.send. */
export type DeliverOutboundOptions = {
  targetMessage?: Message;
};

/** Options for a bounded recent-ID tracker. */
export type RecentIdTrackerOptions = {
  /** How long an ID stays claimed before it can be accepted again. */
  ttlMs: number;
  /** Maximum number of IDs retained; oldest entries are evicted first. */
  maxSize: number;
  /** Optional clock for tests. */
  now?: () => number;
};

/** Bounded recent-ID tracker for idempotent inbound delivery. */
export type RecentIdTracker = {
  /**
   * Claims an ID if it has not been seen recently.
   * @param id - Stable inbound message ID.
   * @returns True when this is the first claim within the TTL window.
   */
  claim: (id: string) => boolean;
  /** Clears all claimed IDs. */
  clear: () => void;
  /** Number of currently retained IDs (for tests). */
  size: () => number;
};

/** Local temp paths for a generated image album. */
export type GeneratedImageAlbum = {
  paths: string[];
  tempDir: string;
};

/** Progress reported while an image album is generated and downloaded. */
export type ImageGenerationProgress = {
  phase: "queued" | "processing" | "downloading";
  completedImages: number;
  totalImages: number;
};

/** Test/injection hooks for GMI image generation. */
export type GenerateGmiImagesOptions = {
  fetchFn?: typeof fetch;
  now?: () => number;
  onProgress?: (progress: ImageGenerationProgress) => void;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

/** Seedream request body for GMI image generation. */
export type SeedreamImagePayload = {
  prompt: string;
  size: string;
  output_format: "jpeg" | "png";
  max_images: number;
  sequential_image_generation: "auto" | "disabled";
  watermark: boolean;
};

/** Queue/status response from the GMI image request API. */
export type GmiImageResponse = {
  request_id?: string;
  status?: string;
  outcome?: {
    media_urls?: Array<{ id?: string; url?: string }>;
  };
  error?: string | { message?: string };
};
