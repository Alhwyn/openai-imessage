export const getMapsViewerBaseUrl = (): string | undefined => {
  const value = process.env.MAPS_PUBLIC_BASE_URL?.trim();
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
};

export const getMapsViewerPageUrl = (
  sessionId: string,
  token: string,
): string | undefined => {
  const baseUrl = getMapsViewerBaseUrl();
  if (!baseUrl) return undefined;
  return `${baseUrl}/maps/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;
};
