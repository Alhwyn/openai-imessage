import type { ComputerPublicUrls } from "./types";

/**
 * Scale the URL to fit the screen.
 * @param value - The URL to scale.
 * @returns The scaled URL.
 */
const withScaleToFit = (value: string): string => {
  try {
    const url = new URL(value);
    url.searchParams.set("resize", "scale");
    return url.href;
  } catch {
    return value;
  }
};

/**
 * Get the URL for the live view.
 * @returns The URL for the live view.
 */
const getLiveViewUrl = (): string | undefined =>
  process.env.COMPUTER_LIVE_VIEW_URL?.trim() || undefined;

/**
 * Get the URL for the Kasm stream.
 * @returns The URL for the Kasm stream.
 */
export const getKasmStreamUrl = (): string | undefined => {
  const liveViewUrl = getLiveViewUrl();
  return liveViewUrl ? withScaleToFit(liveViewUrl) : undefined;
};

export const getComputerViewerBaseUrl = (): string | undefined => {
  const liveViewUrl = getLiveViewUrl();
  if (!liveViewUrl) return undefined;

  try {
    const url = new URL(liveViewUrl);
    if (url.hostname.startsWith("desktop.")) {
      url.hostname = `viewer.${url.hostname.slice("desktop.".length)}`;
      url.pathname = "/";
      url.search = "";
      url.hash = "";
      return url.origin;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

/**
 * Get the URL for the computer viewer page.
 * @param taskId - The ID of the computer task.
 * @param viewerToken - The token for the viewer page.
 * @returns The URL for the computer viewer page.
 */
export const getComputerViewerPageUrl = (
  taskId: string,
  viewerToken: string,
): string | undefined => {
  const baseUrl = getComputerViewerBaseUrl();
  if (!baseUrl) return undefined;
  return `${baseUrl}/computer/${encodeURIComponent(taskId)}?token=${encodeURIComponent(viewerToken)}`;
};

/**
 * Resolve the public URLs for a computer task.
 * @param taskId - The ID of the computer task.
 * @param viewerToken - The token for the viewer page.
 * @returns The public URLs for the computer task.
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
