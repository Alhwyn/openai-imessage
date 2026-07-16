import { attachment, group, text } from "@spectrum-ts/core";

import { tapbackEmoji } from "../agents/tapbacks";

import type { DeliverOutboundOptions } from "./types";
import type { OutboundItem } from "../agents/types";
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
 * Delivers queued outbound items via Spectrum sugar: `message.reply` / `message.react`,
 * falling back to `space.send` for text when there is no target message.
 * @param space - The space to deliver to.
 * @param outbound - Ordered outbound items from the interaction agent.
 * @param options - Optional target message for replies/reactions.
 * @returns Nothing after every item has been sent.
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
        if (targetMessage) {
          await targetMessage.reply(text(item.text));
        } else {
          await space.send(text(item.text));
        }
        break;
      }
      case "reaction": {
        if (!targetMessage) {
          console.warn("[deliver] Skipping reaction; no target message");
          break;
        }
        await targetMessage.react(tapbackEmoji(item.emoji));
        break;
      }
      case "album": {
        const content = buildAlbumContent(item.paths);
        if (targetMessage) {
          await targetMessage.reply(content);
        } else {
          await space.send(content);
        }
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
 * Delivers plain text replies via `space.send` (no thread target).
 * @param space - The space to deliver replies to.
 * @param replies - The replies to deliver.
 * @returns Nothing after every reply has been sent.
 */
export const deliverReplies = async (space: Space, replies: string[]): Promise<void> => {
  await deliverOutbound(
    space,
    replies.map((reply) => ({ kind: "text" as const, text: reply })),
  );
};
