export type ComputerPublicUrls = {
  /** Raw Kasm stream — iframe src only, never the iMessage card. */
  kasmStreamUrl?: string;
  /** Token-gated viewer page — iMessage card / OG "Computer use". */
  viewerPageUrl?: string;
};

const withScaleToFit = (value: string): string => {
  try {
    const url = new URL(value);
    url.searchParams.set("resize", "scale");
    return url.href;
  } catch {
    return value;
  }
};

export const isExternallyReachableHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".local")
    ) return false;

    if (
      /^10\./u.test(hostname) ||
      /^192\.168\./u.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./u.test(hostname)
    ) return false;

    return true;
  } catch {
    return false;
  }
};

/**
 * Derives `https://{prefix}.{zone}` from public BASE_URL.
 * `https://agent.alhwyn.com` → zone `alhwyn.com`.
 */
export const deriveComputerPublicHostUrl = (
  prefix: "desktop" | "viewer",
): string | undefined => {
  const baseUrl = process.env.BASE_URL?.trim();
  if (!baseUrl || !isExternallyReachableHttpUrl(baseUrl)) return undefined;
  try {
    const url = new URL(baseUrl);
    const zoneHostname = url.hostname.startsWith("agent.")
      ? url.hostname.slice("agent.".length)
      : url.hostname;
    return `${url.protocol}//${prefix}.${zoneHostname}`;
  } catch {
    return undefined;
  }
};

/** Public Kasm stream URL (iframe only). */
export const getKasmStreamUrl = (): string | undefined => {
  const configured = process.env.COMPUTER_LIVE_VIEW_URL?.trim();
  if (configured) {
    if (isExternallyReachableHttpUrl(configured)) return withScaleToFit(configured);

    console.warn("[computer] Ignoring non-public COMPUTER_LIVE_VIEW_URL");
  }

  const derived = deriveComputerPublicHostUrl("desktop");
  return derived ? withScaleToFit(derived) : undefined;
};

/**
 * Prefer COMPUTER_VIEWER_URL, then viewer.* from BASE_URL, then
 * desktop.* → viewer.* when only COMPUTER_LIVE_VIEW_URL is configured.
 */
export const getComputerViewerBaseUrl = (): string | undefined => {
  const configured = process.env.COMPUTER_VIEWER_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    if (isExternallyReachableHttpUrl(configured)) return configured;
    console.warn("[computer] Ignoring non-public COMPUTER_VIEWER_URL");
  }

  const fromBase = deriveComputerPublicHostUrl("viewer");
  if (fromBase) return fromBase;

  const liveView = process.env.COMPUTER_LIVE_VIEW_URL?.trim();
  if (liveView && isExternallyReachableHttpUrl(liveView)) try {
    const url = new URL(liveView);
    if (url.hostname.startsWith("desktop.")) {
      url.hostname = `viewer.${url.hostname.slice("desktop.".length)}`;
      url.pathname = "/";
      url.search = "";
      url.hash = "";
      return url.origin;
    }
  } catch {
    // ignore invalid live-view URL
  }

  return undefined;
};

export const getComputerViewerPageUrl = (
  taskId: string,
  viewerToken: string,
): string | undefined => {
  const baseUrl = getComputerViewerBaseUrl();
  if (!baseUrl) return undefined;
  return `${baseUrl}/computer/${encodeURIComponent(taskId)}?token=${encodeURIComponent(viewerToken)}`;
};

/**
 * Resolves public computer URLs for a task.
 * Card = viewer page only; Kasm never goes to iMessage.
 */
export const resolveComputerPublicUrls = (
  taskId: string,
  viewerToken: string,
): ComputerPublicUrls => {
  const kasmStreamUrl = getKasmStreamUrl();
  if (!kasmStreamUrl) return {};
  return {
    kasmStreamUrl,
    viewerPageUrl: getComputerViewerPageUrl(taskId, viewerToken),
  };
};
