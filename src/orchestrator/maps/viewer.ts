import { MAPS_VIEWER_HOST, MAPS_VIEWER_PORT } from "./constants";
import { getMapsSession } from "./session";
import { mapsViewerHtml } from "./viewerPage";

const htmlResponse = (): Response =>
  new Response(mapsViewerHtml, {
    headers: {
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'self'; img-src 'self' data: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.ggpht.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com; connect-src 'self' https://maps.googleapis.com https://*.googleapis.com; worker-src blob:;",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const parseMapsRequest = (
  request: Request,
): { sessionId: string; token: string } | null => {
  const url = new URL(request.url);
  const match = /^\/api\/maps\/([^/]+)$/.exec(url.pathname);
  const sessionId = match?.[1] ? decodeURIComponent(match[1]) : "";
  const token = url.searchParams.get("token")?.trim() ?? "";
  return sessionId && token ? { sessionId, token } : null;
};

const sessionResponse = (request: Request): Response => {
  const access = parseMapsRequest(request);
  if (!access) return jsonResponse({ error: "Invalid map link" }, 404);

  const session = getMapsSession(access.sessionId, access.token);
  if (!session) return jsonResponse({ error: "Map link not found" }, 404);

  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!mapsApiKey) return jsonResponse({ error: "Maps API key missing" }, 500);

  return jsonResponse({
    destinationName: session.destinationName,
    searchArea: session.searchArea,
    lat: session.lat,
    lng: session.lng,
    mapsApiKey,
  });
};

export const handleMapsViewerRequest = (request: Request): Response => {
  const url = new URL(request.url);
  if (request.method !== "GET") return new Response(null, { status: 405 });
  if (/^\/maps\/[^/]+$/.test(url.pathname)) return htmlResponse();
  if (/^\/api\/maps\/[^/]+$/.test(url.pathname)) return sessionResponse(request);
  return new Response(null, { status: 404 });
};

export { getMapsViewerBaseUrl, getMapsViewerPageUrl } from "./urls";

let viewerServer: ReturnType<typeof Bun.serve> | undefined;

export const startMapsViewer = (): ReturnType<typeof Bun.serve> => {
  if (viewerServer) return viewerServer;
  viewerServer = Bun.serve({
    hostname: MAPS_VIEWER_HOST,
    port: MAPS_VIEWER_PORT,
    fetch: handleMapsViewerRequest,
  });
  console.log(`[maps-viewer] Listening on ${String(viewerServer.url)}`);
  return viewerServer;
};
