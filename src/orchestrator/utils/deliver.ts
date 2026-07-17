import { app, attachment, group, text } from "@spectrum-ts/core";

import { tapbackEmoji } from "../tapbacks";

import type { DeliverOutboundOptions } from "./types";
import type { OutboundItem } from "../contracts";
import type { ContentInput, Space } from "@spectrum-ts/core";

const buildAlbumContent = (paths: string[]): ContentInput => {
  if (paths.length === 0) {
    throw new Error("Album outbound item requires at least one path");
  }

  if (paths.length === 1) {
    return attachment(paths[0]!);
  }

  const [first, second, ...rest] = paths.map((path) => attachment(path));
  if (!first || !second) {
    throw new Error("Album outbound item requires at least two paths for a group");
  }

  return group(first, second, ...rest);
};

/**
 * Delivers queued outbound items via Spectrum.
 * Text and albums always use `space.send` (never threaded reply).
 * Reactions use `message.react` when a target message is provided.
 */
export const deliverOutbound = async (
  space: Space,
  outbound: OutboundItem[],
  options: DeliverOutboundOptions = {},
): Promise<void> => {
  const { targetMessage } = options;

  for (const item of outbound) {
    switch (item.kind) {
      case "text": {
        console.log("[deliver] Sending text via space.send", {
          preview: item.text.slice(0, 120),
        });
        await space.send(text(item.text));
        break;
      }
      case "reaction": {
        if (!targetMessage) {
          console.warn("[deliver] Skipping reaction; no target message");
          break;
        }
        console.log("[deliver] Sending reaction", { emoji: item.emoji });
        await targetMessage.react(tapbackEmoji(item.emoji));
        break;
      }
      case "album": {
        const totalBytes = item.paths.reduce(
          (total, path) => total + Bun.file(path).size,
          0,
        );
        console.log("[deliver] Sending grouped album via space.send", {
          pathCount: item.paths.length,
          paths: item.paths,
          totalBytes,
          totalMebibytes: Number((totalBytes / 1_048_576).toFixed(2)),
        });
        await space.send(buildAlbumContent(item.paths));
        break;
      }
      case "app": {
        console.log("[deliver] Sending app deep-link via space.send", {
          url: item.url,
        });
        await space.send(app(item.url));
        break;
      }
      default: {
        const _exhaustive: never = item;
        throw new Error(`Unhandled outbound kind: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
};

/**
 * Delivers plain text via `space.send`.
 */
export const deliverReplies = async (space: Space, replies: string[]): Promise<void> => {
  await deliverOutbound(
    space,
    replies.map((reply) => ({ kind: "text" as const, text: reply })),
  );
};
