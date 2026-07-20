export type TapbackKey =
  | "love"
  | "like"
  | "dislike"
  | "laugh"
  | "emphasize"
  | "question";

/** In-memory image input forwarded to a vision-capable model. */
export type InboundImage = {
  data: Uint8Array;
  filename: string;
  mediaType: string;
};

/** Item queued for Spectrum delivery. */
export type OutboundItem =
  | { kind: "text"; text: string }
  | { kind: "reaction"; emoji: TapbackKey }
  | { kind: "album"; paths: string[] }
  | { kind: "app"; url: string; presentation?: "computer" | "maps" }
  /** Chat wallpaper: `image` sets JPEG bytes; omit to clear. */
  | { kind: "background"; image?: Uint8Array };
