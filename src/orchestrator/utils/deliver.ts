import type { Space } from "@spectrum-ts/core";
import { text } from "@spectrum-ts/core";

/**
 * Delivers replies to a space.
 * @param space - The space to deliver replies to.
 * @param replies - The replies to deliver.
 * @returns A promise that resolves when the replies are delivered.
 */
export const deliverReplies = async (space: Space, replies: string[]): Promise<void> => {
  for (const reply of replies) {
    await space.send(text(reply));
  }
};
