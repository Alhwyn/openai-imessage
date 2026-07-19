import { isAbsolute, relative, resolve } from "node:path";

import { getComputerViewerSnapshot } from "../db/computerRuns";

const DEFAULT_VIEWER_PORT = 6902;
const DEFAULT_PUBLIC_VIEWER_URL = "https://viewer.alhwyn.com";
const ARTIFACTS_ROOT = resolve("runtime/computer/artifacts");

const viewerHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="description" content="Watch the computer agent work live." />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Computer agent" />
  <meta property="og:description" content="Watch the computer agent work live." />
  <meta property="og:image" content="__PREVIEW_IMAGE__" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:image" content="__PREVIEW_IMAGE__" />
  <link rel="icon" type="image/png" href="/computer-favicon" />
  <link rel="apple-touch-icon" href="/computer-favicon" />
  <title>Agent desktop</title>
  <style>
    :root {
      color: #191919;
      background: #f7f7f5;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-synthesis: none;
    }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; background: #f7f7f5; }
    button { font: inherit; }
    .shell { width: min(1120px, 100%); margin: 0 auto; padding: 18px 20px 40px; }
    .layout { display: block; }
    .stage-card {
      overflow: hidden;
      background: transparent;
    }
    .stage { position: relative; aspect-ratio: 16 / 10; overflow: hidden; border: 1px solid #dededb; border-radius: 7px; background: #e9e9e7; }
    .stage iframe, .stage video { width: 100%; height: 100%; border: 0; object-fit: contain; background: #181818; }
    .poster {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        linear-gradient(rgba(255,255,255,.08), rgba(0,0,0,.14)),
        url("/computer-wallpaper") center / cover;
      transition: opacity .18s ease, visibility .18s ease;
      z-index: 4;
    }
    .poster.hidden { opacity: 0; visibility: hidden; pointer-events: none; }
    .watch {
      display: grid;
      width: 52px;
      height: 52px;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid rgba(255,255,255,.55);
      border-radius: 50%;
      color: white;
      background: rgba(25,25,25,.78);
      box-shadow: 0 2px 12px rgba(0,0,0,.18);
      cursor: pointer;
      transition: background .15s ease;
    }
    .watch:hover { background: #191919; }
    .play-icon {
      width: 0;
      height: 0;
      margin-left: 3px;
      border-top: 7px solid transparent;
      border-bottom: 7px solid transparent;
      border-left: 11px solid currentColor;
    }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
    .cursor {
      position: absolute;
      z-index: 3;
      width: 12px;
      height: 12px;
      margin: -6px 0 0 -6px;
      border: 2px solid white;
      border-radius: 50%;
      background: #e25241;
      box-shadow: 0 1px 5px rgba(0,0,0,.3);
      opacity: 0;
      pointer-events: none;
      transition: left .2s ease, top .2s ease, opacity .15s ease;
    }
    .cursor.visible { opacity: 1; }
    .cursor.pulse::after {
      position: absolute;
      inset: -9px;
      border: 1px solid #e25241;
      border-radius: 50%;
      content: "";
      animation: click .55s ease-out;
    }
    @keyframes click { to { transform: scale(1.7); opacity: 0; } }
    .timeline-card {
      margin-top: 10px;
      overflow: hidden;
      border: 1px solid #dededb;
      border-radius: 7px;
      background: #fff;
    }
    .events {
      display: flex;
      max-height: 250px;
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      overflow-y: auto;
      padding: 7px;
      scrollbar-width: thin;
    }
    .empty { padding: 7px 9px; color: #999; font-size: 11px; }
    .event {
      position: relative;
      display: grid;
      min-width: 0;
      grid-template-columns: 18px minmax(0, 1fr);
      align-items: start;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 5px;
      cursor: pointer;
      transition: background .12s ease;
    }
    .event::after {
      position: absolute;
      top: 24px;
      bottom: -7px;
      left: 16.5px;
      width: 1px;
      background: #dededb;
      content: "";
    }
    .event:last-child::after { display: none; }
    .event:hover { background: #f3f3f1; }
    .event.selected { background: #e9e9e7; }
    .event:hover .event-label, .event.selected .event-label { color: #191919; }
    .event-icon {
      display: grid;
      position: relative;
      z-index: 1;
      width: 18px;
      height: 18px;
      place-items: center;
      border: 1px solid #d8d8d4;
      border-radius: 50%;
      color: #666;
      background: #fff;
      font-size: 9px;
    }
    .event.selected .event-icon {
      border-color: #bdbdb8;
      color: #333;
      background: #f7f7f5;
    }
    .event-copy {
      min-width: 0;
      padding-top: 1px;
    }
    .event-label {
      overflow: hidden;
      margin: 0;
      color: #4f4f4c;
      font-size: 12px;
      font-weight: 500;
      line-height: 16px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .event-meta {
      overflow: hidden;
      margin-top: 1px;
      color: #999;
      font-size: 10px;
      line-height: 14px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .error {
      display: none;
      margin: 0 0 8px;
      padding: 8px 10px;
      border: 1px solid #e8c8c3;
      border-radius: 7px;
      color: #9a4034;
      background: #fff6f4;
      font-size: 11px;
    }
    .error.visible { display: block; }
    @media (max-width: 640px) {
      .shell { padding: 10px 10px 24px; }
      .stage { border-radius: 5px; }
      .events { max-height: 200px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <p class="error" id="error"></p>
    <div class="layout">
      <section class="stage-card">
        <div class="stage" id="stage">
          <iframe id="desktop" title="Agent desktop live view" allow="clipboard-read; clipboard-write" hidden></iframe>
          <video id="recording" controls playsinline hidden></video>
          <div class="cursor" id="cursor"></div>
          <div class="poster" id="poster">
            <button class="watch" id="watch"><span class="play-icon"></span><span class="sr-only">Watch agent live</span></button>
          </div>
        </div>
      </section>
      <section class="timeline-card" aria-label="Agent activity">
        <div class="events" id="events"><div class="empty">Actions will appear here as the agent clicks, types, and moves through the task.</div></div>
      </section>
    </div>
  </main>
  <script>
    const pathParts = location.pathname.split("/").filter(Boolean);
    const taskId = pathParts.at(-1) || "";
    const token = new URLSearchParams(location.search).get("token") || "";
    const apiUrl = "/api/computer/" + encodeURIComponent(taskId) + "?token=" + encodeURIComponent(token);
    const els = {
      cursor: document.querySelector("#cursor"),
      desktop: document.querySelector("#desktop"),
      error: document.querySelector("#error"),
      events: document.querySelector("#events"),
      poster: document.querySelector("#poster"),
      recording: document.querySelector("#recording"),
      watch: document.querySelector("#watch"),
    };
    let snapshot;
    let viewing = false;
    let selectedSequence = 0;
    let knownEventCount = 0;

    const iconFor = (type) => ({
      click: "↗", double_click: "↗", move: "•", scroll: "↕",
      type: "T", keypress: "⌘", drag: "↝", wait: "◷", screenshot: "◎"
    })[type] || "•";

    const timeLabel = (timestamp) => new Intl.DateTimeFormat([], {
      minute: "2-digit", second: "2-digit"
    }).format(new Date(timestamp));

    function showPointer(event) {
      if (!event || event.x == null || event.y == null || !snapshot) {
        els.cursor.classList.remove("visible");
        return;
      }
      els.cursor.style.left = (event.x / snapshot.display.width * 100) + "%";
      els.cursor.style.top = (event.y / snapshot.display.height * 100) + "%";
      els.cursor.classList.remove("pulse");
      void els.cursor.offsetWidth;
      els.cursor.classList.add("visible");
      if (event.actionType.includes("click")) els.cursor.classList.add("pulse");
    }

    function selectEvent(sequence) {
      if (!snapshot?.events.length) return;
      selectedSequence = Math.max(1, Math.min(sequence, snapshot.events.length));
      const event = snapshot.events.find((item) => item.sequence === selectedSequence);
      showPointer(event);
      for (const row of els.events.querySelectorAll(".event")) {
        row.classList.toggle("selected", Number(row.dataset.sequence) === selectedSequence);
      }
    }

    function renderEvents(events) {
      const shouldFollow = selectedSequence === 0 || selectedSequence >= knownEventCount;
      knownEventCount = events.length;
      if (!events.length) {
        els.events.innerHTML = '<div class="empty">Actions will appear here as the agent clicks, types, and moves through the task.</div>';
        return;
      }
      const fragment = document.createDocumentFragment();
      for (const event of events) {
        const row = document.createElement("div");
        row.className = "event";
        row.dataset.sequence = String(event.sequence);
        const icon = document.createElement("div");
        icon.className = "event-icon";
        icon.textContent = iconFor(event.actionType);
        const copy = document.createElement("div");
        copy.className = "event-copy";
        const label = document.createElement("div");
        label.className = "event-label";
        label.textContent = event.label;
        const meta = document.createElement("div");
        meta.className = "event-meta";
        const position = event.x == null ? "" : " · " + Math.round(event.x) + ", " + Math.round(event.y);
        meta.textContent = "Step " + event.step + position + (event.detail ? " · " + event.detail : "") + " · " + timeLabel(event.createdAt);
        copy.append(label, meta);
        row.append(icon, copy);
        row.addEventListener("click", () => selectEvent(event.sequence));
        fragment.append(row);
      }
      els.events.replaceChildren(fragment);
      if (shouldFollow) {
        selectEvent(events.at(-1).sequence);
        els.events.scrollTop = els.events.scrollHeight;
      } else {
        selectEvent(selectedSequence);
      }
    }

    function startViewing() {
      if (!snapshot) return;
      viewing = true;
      els.poster.classList.add("hidden");
      const hasRecording = snapshot.run.state === "completed" && snapshot.recordingUrl;
      if (hasRecording) {
        els.desktop.hidden = true;
        els.recording.hidden = false;
        if (!els.recording.src) els.recording.src = snapshot.recordingUrl;
        void els.recording.play().catch(() => undefined);
      } else {
        els.recording.hidden = true;
        els.desktop.hidden = false;
        if (!els.desktop.src) els.desktop.src = snapshot.streamUrl;
      }
    }

    function render(next) {
      snapshot = next;
      const state = next.run.state;
      renderEvents(next.events);
      if (viewing && state === "completed" && next.recordingUrl && els.recording.hidden) {
        els.desktop.hidden = true;
        els.recording.hidden = false;
        els.recording.src = next.recordingUrl;
      }
    }

    async function refresh() {
      try {
        const response = await fetch(apiUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 404 ? "This viewer link is invalid or expired." : "Could not load the computer session.");
        render(await response.json());
        els.error.classList.remove("visible");
      } catch (error) {
        els.error.textContent = error instanceof Error ? error.message : String(error);
        els.error.classList.add("visible");
      }
    }

    els.watch.addEventListener("click", startViewing);
    refresh();
    setInterval(refresh, 1200);
  </script>
</body>
</html>`;

const htmlResponse = (request: Request): Response => {
  const previewImage = new URL("/computer-favicon", request.url);
  if (request.headers.get("x-forwarded-proto") === "https") {
    previewImage.protocol = "https:";
  }
  const previewImageUrl = previewImage.href;
  return new Response(viewerHtml.replaceAll("__PREVIEW_IMAGE__", previewImageUrl), {
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
  ) {
    return jsonResponse({ error: "Invalid recording path" }, 403);
  }

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
    display: {
      width: Number(process.env.COMPUTER_DISPLAY_WIDTH ?? 1280),
      height: Number(process.env.COMPUTER_DISPLAY_HEIGHT ?? 800),
    },
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

export const getComputerViewerBaseUrl = (): string => {
  const configured = process.env.COMPUTER_VIEWER_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const hostname = new URL(configured).hostname;
      if (hostname !== "127.0.0.1" && hostname !== "localhost") return configured;
    } catch {
      return configured;
    }
  }

  const baseUrl = process.env.BASE_URL?.trim();
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      const zoneHostname = url.hostname.startsWith("agent.")
        ? url.hostname.slice("agent.".length)
        : url.hostname;
      return `${url.protocol}//viewer.${zoneHostname}`;
    } catch {
      console.warn("[computer-viewer] Ignoring invalid BASE_URL for public viewer");
    }
  }

  return DEFAULT_PUBLIC_VIEWER_URL;
};

export const getComputerViewerUrl = (taskId: string, viewerToken: string): string => {
  return `${getComputerViewerBaseUrl()}/computer/${encodeURIComponent(taskId)}?token=${encodeURIComponent(viewerToken)}`;
};

let viewerServer: ReturnType<typeof Bun.serve> | undefined;

export const startComputerViewer = (): ReturnType<typeof Bun.serve> => {
  if (viewerServer) return viewerServer;
  const port = Number(process.env.COMPUTER_VIEWER_PORT ?? DEFAULT_VIEWER_PORT);
  viewerServer = Bun.serve({
    hostname: process.env.COMPUTER_VIEWER_HOST?.trim() || "127.0.0.1",
    port,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (request.method !== "GET") return new Response(null, { status: 405 });
      if (/^\/computer\/[^/]+$/.test(url.pathname)) return htmlResponse(request);
      if (url.pathname === "/computer-wallpaper") return await wallpaperResponse();
      if (url.pathname === "/computer-favicon" || url.pathname === "/favicon.ico") {
        return await faviconResponse();
      }
      if (/^\/api\/computer\/[^/]+\/recording$/.test(url.pathname)) {
        return await recordingResponse(request);
      }
      if (/^\/api\/computer\/[^/]+$/.test(url.pathname)) {
        return await snapshotResponse(request);
      }
      return new Response(null, { status: 404 });
    },
  });
  console.log(`[computer-viewer] Listening on ${String(viewerServer.url)}`);
  return viewerServer;
};
