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

/** Test/injection hooks for OpenAI image generation. */
export type GenerateImagesOptions = {
  fetchFn?: typeof fetch;
  now?: () => number;
  onProgress?: (progress: ImageGenerationProgress) => void;
  timeoutMs?: number;
};

/** Success envelope from OpenAI `POST /v1/images/generations`. */
export type OpenAiImagesResponse = {
  created?: number;
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
    param?: string;
  };
};
