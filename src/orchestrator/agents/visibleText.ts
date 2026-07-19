type TextLikePart = {
  type: string;
  text?: string;
  providerMetadata?: {
    openai?: {
      phase?: "commentary" | "final_answer" | null;
    };
  };
};

/**
 * True when text looks like leaked planning / tool narration rather than chat.
 */
export const looksLikeInternalPlanning = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  return (
    /\bassign_\w+_task\b/i.test(trimmed) ||
    /\bget_\w+_task_status\b/i.test(trimmed) ||
    /\breact_to_message\b/i.test(trimmed) ||
    /\bsend_auth_link\b/i.test(trimmed) ||
    /\bcomposio_search_tools\b/i.test(trimmed) ||
    /\bcommentary tool\b/.test(lower) ||
    /\buse commentary\b/.test(lower) ||
    /\bdeveloper says\b/.test(lower) ||
    /\btool call\b/.test(lower) ||
    /\bdon't text\b/.test(lower) ||
    /\bdo not text\b/.test(lower) ||
    /\bqueues? ack\b/.test(lower)
  );
};

/**
 * Prefer Responses `final_answer` text; drop `commentary` planning leaks.
 * Falls back to unphased text, then rejects obvious internal narration.
 */
export const extractVisibleAssistantText = (
  content: ReadonlyArray<TextLikePart>,
  fallbackText = "",
): string => {
  const textParts = content.filter(
    (part): part is TextLikePart & { type: "text"; text: string } =>
      part.type === "text" && typeof part.text === "string" && part.text.length > 0,
  );

  const hasPhase = textParts.some((part) => {
    const phase = part.providerMetadata?.openai?.phase;
    return phase === "commentary" || phase === "final_answer";
  });

  const candidates = hasPhase
    ? textParts.filter(
        (part) => part.providerMetadata?.openai?.phase === "final_answer",
      )
    : textParts;

  const joined = candidates
    .map((part) => part.text)
    .join("")
    .trim();

  if (joined) {
    return looksLikeInternalPlanning(joined) ? "" : joined;
  }

  const fallback = fallbackText.trim();
  if (!fallback || looksLikeInternalPlanning(fallback)) return "";
  return fallback;
};
