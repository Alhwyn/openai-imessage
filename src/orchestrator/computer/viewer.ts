import { isAbsolute, relative, resolve } from "node:path";

import { getComputerViewerSnapshot } from "../db/computerRuns";

import {
  COMPUTER_DISPLAY_SIZE,
  COMPUTER_VIEWER_HOST,
  COMPUTER_VIEWER_PORT,
} from "./constants";
import { computerViewerHtml } from "./viewerPage";

const ARTIFACTS_ROOT = resolve("runtime/computer/artifacts");

const htmlResponse = (request: Request): Response => {
  const previewImage = new URL("/computer-favicon", request.url);
  if (request.headers.get("x-forwarded-proto") === "https") previewImage.protocol = "https:";

  const previewImageUrl = previewImage.href;
  return new Response(computerViewerHtml.replaceAll("__PREVIEW_IMAGE__", previewImageUrl), {
    headers: {
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src http: https:; media-src 'self';",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
};

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const parseComputerRequest = (
  request: Request,
): { taskId: string; token: string } | null => {
  const url = new URL(request.url);
  const match = /^\/api\/computer\/([^/]+)(?:\/recording)?$/.exec(url.pathname);
  const taskId = match?.[1] ? decodeURIComponent(match[1]) : "";
  const token = url.searchParams.get("token")?.trim() ?? "";
  return taskId && token ? { taskId, token } : null;
};

const recordingResponse = async (request: Request): Promise<Response> => {
  const access = parseComputerRequest(request);
  if (!access) return jsonResponse({ error: "Invalid viewer link" }, 404);
  const snapshot = await getComputerViewerSnapshot(access.taskId, access.token);
  const recordingPath = snapshot?.run.recordingPath;
  if (!recordingPath) return jsonResponse({ error: "Recording is not ready" }, 404);

  const absolutePath = resolve(recordingPath);
  const artifactRelativePath = relative(ARTIFACTS_ROOT, absolutePath);
  if (
    !artifactRelativePath ||
    artifactRelativePath.startsWith("..") ||
    isAbsolute(artifactRelativePath)
  ) return jsonResponse({ error: "Invalid recording path" }, 403);

  const file = Bun.file(absolutePath);
  if (!(await file.exists())) return jsonResponse({ error: "Recording not found" }, 404);
  return new Response(file, {
    headers: {
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=300",
      "content-type": "video/mp4",
    },
  });
};

const snapshotResponse = async (request: Request): Promise<Response> => {
  const access = parseComputerRequest(request);
  if (!access) return jsonResponse({ error: "Invalid viewer link" }, 404);
  const snapshot = await getComputerViewerSnapshot(access.taskId, access.token);
  if (!snapshot) return jsonResponse({ error: "Viewer link not found" }, 404);

  const recordingUrl = snapshot.run.recordingPath
    ? `/api/computer/${encodeURIComponent(access.taskId)}/recording?token=${encodeURIComponent(access.token)}`
    : undefined;
  return jsonResponse({
    ...snapshot,
    display: COMPUTER_DISPLAY_SIZE,
    recordingUrl,
  });
};

const wallpaperResponse = async (): Promise<Response> => {
  const file = Bun.file(resolve("runtime/computer/assets/harbor-wallpaper.png"));
  if (!(await file.exists())) return new Response(null, { status: 404 });
  return new Response(file, {
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "image/png",
    },
  });
};

const faviconResponse = async (): Promise<Response> => {
  const file = Bun.file(resolve("runtime/computer/assets/computer-favicon.png"));
  if (!(await file.exists())) return new Response(null, { status: 404 });
  return new Response(file, {
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "image/png",
    },
  });
};

export {
  getComputerViewerBaseUrl,
  getComputerViewerPageUrl as getComputerViewerUrl,
} from "./urls";

let viewerServer: ReturnType<typeof Bun.serve> | undefined;

export const startComputerViewer = (): ReturnType<typeof Bun.serve> => {
  if (viewerServer) return viewerServer;
  viewerServer = Bun.serve({
    hostname: COMPUTER_VIEWER_HOST,
    port: COMPUTER_VIEWER_PORT,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (request.method !== "GET") return new Response(null, { status: 405 });
      if (/^\/computer\/[^/]+$/.test(url.pathname)) return htmlResponse(request);
      if (url.pathname === "/computer-wallpaper") return wallpaperResponse();
      if (url.pathname === "/computer-favicon" || url.pathname === "/favicon.ico") return faviconResponse();

      if (/^\/api\/computer\/[^/]+\/recording$/.test(url.pathname)) return recordingResponse(request);

      if (/^\/api\/computer\/[^/]+$/.test(url.pathname)) return snapshotResponse(request);

      return new Response(null, { status: 404 });
    },
  });
  console.log(`[computer-viewer] Listening on ${String(viewerServer.url)}`);
  return viewerServer;
};
