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
 * Prefer Responses `final_answer` text; drop `commentary` planning leaks.
 * Without phase metadata, keep unphased text (tools own suppress via TextPolicy).
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

  if (hasPhase) {
    return textParts
      .filter((part) => part.providerMetadata?.openai?.phase === "final_answer")
      .map((part) => part.text)
      .join("")
      .trim();
  }

  if (textParts.length > 0) {
    return textParts.map((part) => part.text).join("").trim();
  }

  return fallbackText.trim();
};
