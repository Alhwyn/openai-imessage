import type { Space } from "@spectrum-ts/core";
import { text } from "@spectrum-ts/core";

export const deliverReplies = async (space: Space, replies: string[]): Promise<void> => {
  for (const reply of replies) {
    await space.send(text(reply));
  }
};
