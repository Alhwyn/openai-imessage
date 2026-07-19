export type MemoryEdit =
  | { action: "add"; text: string }
  | { action: "replace"; oldText: string; text: string }
  | { action: "remove"; oldText: string };

/**
 * Appends a trimmed entry if it is new and within the character limit.
 */
export const applyAdd = (body: string, text: string, limit: number): string => {
  const entry = text.trim();
  if (!entry) return body;
  if (body.includes(entry)) return body;

  const next = body ? `${body}\n${entry}` : entry;
  if (next.length > limit) throw new Error(`Memory exceeds ${limit} character limit`);

  return next;
};

/**
 * Replaces the first occurrence of oldText with newText within the limit.
 */
export const applyReplace = (
  body: string,
  oldText: string,
  newText: string,
  limit: number,
): string => {
  if (!oldText || !body.includes(oldText)) throw new Error("old_text not found in memory");

  const next = body.replace(oldText, newText);
  if (next.length > limit) throw new Error(`Memory exceeds ${limit} character limit`);

  return next;
};

/**
 * Removes all occurrences of oldText and collapses excess blank lines.
 */
export const applyRemove = (body: string, oldText: string): string => {
  if (!oldText || !body.includes(oldText)) throw new Error("old_text not found in memory");

  return body.replaceAll(oldText, "").replace(/\n{3,}/g, "\n\n").trim();
};

/**
 * Applies a discriminated memory edit to the current body.
 */
export const applyMemoryEditBody = (
  body: string,
  edit: MemoryEdit,
  limit: number,
): string => {
  switch (edit.action) {
    case "add":
      return applyAdd(body, edit.text, limit);
    case "replace":
      return applyReplace(body, edit.oldText, edit.text, limit);
    case "remove":
      return applyRemove(body, edit.oldText);
    default: {
      const _exhaustive: never = edit;
      throw new Error(`Unknown action: ${JSON.stringify(_exhaustive)}`);
    }
  }
};
