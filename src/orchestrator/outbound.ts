import type { OutboundItem } from "./contracts";

export const summarizeOutbound = (items: OutboundItem[]) => {
  return items.map((item) => {
    switch (item.kind) {
      case "text":
        return { kind: item.kind, preview: item.text.slice(0, 80) };
      case "album":
        return { kind: item.kind, pathCount: item.paths.length };
      case "reaction":
        return { kind: item.kind, emoji: item.emoji };
      case "app":
        return { kind: item.kind, url: item.url };
      default: {
        const _exhaustive: never = item;
        throw new Error(`Unhandled outbound kind: ${JSON.stringify(_exhaustive)}`);
      }
    }
  });
};

/**
 * Keeps only the latest text reply while preserving non-text outbound items.
 * The interaction model may emit more than one text item in a turn;
 * a conversational turn should produce at most one text message.
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
