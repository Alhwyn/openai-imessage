import type { OutboundItem } from "./types";

/**
 * Keeps only the latest text reply while preserving non-text outbound items.
 * The interaction model may call its reply tool more than once in one turn,
 * but a conversational turn should produce at most one text message.
 */
export const coalesceTextReplies = (items: OutboundItem[]): OutboundItem[] => {
  let foundText = false;
  const coalesced: OutboundItem[] = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item) continue;

    if (item.kind === "text") {
      if (foundText) continue;
      foundText = true;
    }

    coalesced.push(item);
  }

  return coalesced.reverse();
};
