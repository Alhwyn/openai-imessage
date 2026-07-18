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
