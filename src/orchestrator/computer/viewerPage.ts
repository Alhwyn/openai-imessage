/** Token-gated, full-screen computer-use viewer. */
export const computerViewerHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="dark" />
  <meta name="description" content="Live computer use session." />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Computer use" />
  <meta property="og:description" content="Live computer use session." />
  <meta property="og:site_name" content="Computer use" />
  <meta property="og:image" content="__PREVIEW_IMAGE__" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Computer use" />
  <meta name="twitter:description" content="Live computer use session." />
  <meta name="twitter:image" content="__PREVIEW_IMAGE__" />
  <meta name="apple-mobile-web-app-title" content="Computer use" />
  <link rel="icon" type="image/png" href="/computer-favicon" />
  <link rel="apple-touch-icon" href="/computer-favicon" />
  <title>Computer use</title>
  <style>
    :root { color: white; background: #111; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html, body, .stage { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #111; }
    .stage { position: relative; }
    .viewport {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: #111;
    }
    .surface {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
      will-change: transform;
    }
    .surface iframe,
    .surface video {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: #111;
    }
    .surface video { object-fit: cover; }
    .error {
      display: none;
      position: absolute;
      z-index: 2;
      top: 12px;
      right: 12px;
      left: 12px;
      margin: 0;
      padding: 10px 12px;
      border: 1px solid #e8c8c3;
      border-radius: 7px;
      color: #9a4034;
      background: #fff6f4;
      font-size: 13px;
    }
    .error.visible { display: block; }
  </style>
</head>
<body>
  <main class="stage">
    <p class="error" id="error"></p>
    <div class="viewport" id="viewport">
      <div class="surface" id="surface">
        <iframe id="desktop" title="Agent desktop live view" allow="clipboard-read; clipboard-write" hidden></iframe>
        <video id="recording" controls playsinline hidden></video>
      </div>
    </div>
  </main>
  <script>
    const pathParts = location.pathname.split("/").filter(Boolean);
    const taskId = pathParts.at(-1) || "";
    const token = new URLSearchParams(location.search).get("token") || "";
    const apiUrl = "/api/computer/" + encodeURIComponent(taskId) + "?token=" + encodeURIComponent(token);
    const DEFAULT_DISPLAY = { width: 1280, height: 800 };
    // Crop Kasm's top control bar out of the filled viewport.
    const KASM_CHROME_TOP = 40;

    const els = {
      viewport: document.querySelector("#viewport"),
      surface: document.querySelector("#surface"),
      desktop: document.querySelector("#desktop"),
      recording: document.querySelector("#recording"),
      error: document.querySelector("#error"),
    };

    let display = { ...DEFAULT_DISPLAY };
    let showingRecording = false;

    function layout() {
      const viewportWidth = els.viewport.clientWidth || window.innerWidth;
      const viewportHeight = els.viewport.clientHeight || window.innerHeight;
      const desktopWidth = display.width || DEFAULT_DISPLAY.width;
      const desktopHeight = display.height || DEFAULT_DISPLAY.height;
      const chrome = showingRecording ? 0 : KASM_CHROME_TOP;
      const surfaceWidth = desktopWidth;
      const surfaceHeight = desktopHeight + chrome;

      els.surface.style.width = surfaceWidth + "px";
      els.surface.style.height = surfaceHeight + "px";

      // Cover: fill the phone, crop overflow (no letterbox bars).
      const scale = Math.max(
        viewportWidth / desktopWidth,
        viewportHeight / desktopHeight,
      );
      const translateX = (viewportWidth - desktopWidth * scale) / 2;
      const translateY = (viewportHeight - desktopHeight * scale) / 2 - chrome * scale;

      els.surface.style.transform =
        "translate3d(" + translateX + "px," + translateY + "px,0) scale(" + scale + ")";
    }

    function render(snapshot) {
      if (snapshot.display && snapshot.display.width && snapshot.display.height) {
        display = {
          width: snapshot.display.width,
          height: snapshot.display.height,
        };
      }

      const hasRecording = snapshot.run.state === "completed" && snapshot.recordingUrl;
      if (hasRecording) {
        showingRecording = true;
        els.desktop.hidden = true;
        els.recording.hidden = false;
        if (!els.recording.src) els.recording.src = snapshot.recordingUrl;
      } else {
        showingRecording = false;
        els.recording.hidden = true;
        els.desktop.hidden = false;
        if (!els.desktop.src) els.desktop.src = snapshot.streamUrl;
      }
      layout();
    }

    async function refresh() {
      try {
        const response = await fetch(apiUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(
          response.status === 404
            ? "This viewer link is invalid or expired."
            : "Could not load the computer session.",
        );
        render(await response.json());
        els.error.classList.remove("visible");
      } catch (error) {
        els.error.textContent = error instanceof Error ? error.message : String(error);
        els.error.classList.add("visible");
      }
    }

    window.addEventListener("resize", layout);
    window.addEventListener("orientationchange", layout);
    layout();
    refresh();
    setInterval(refresh, 1200);
  </script>
</body>
</html>`;
