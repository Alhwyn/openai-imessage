/** Token-gated, full-screen computer-use viewer. */
export const computerViewerHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
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
    :root { color: white; background: #181818; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html, body, .stage { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #181818; }
    .stage { position: relative; }
    .stage iframe, .stage video { display: block; width: 100%; height: 100%; border: 0; object-fit: contain; background: #181818; }
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
    <iframe id="desktop" title="Agent desktop live view" allow="clipboard-read; clipboard-write" hidden></iframe>
    <video id="recording" controls playsinline hidden></video>
  </main>
  <script>
    const pathParts = location.pathname.split("/").filter(Boolean);
    const taskId = pathParts.at(-1) || "";
    const token = new URLSearchParams(location.search).get("token") || "";
    const apiUrl = "/api/computer/" + encodeURIComponent(taskId) + "?token=" + encodeURIComponent(token);
    const els = {
      desktop: document.querySelector("#desktop"),
      error: document.querySelector("#error"),
      recording: document.querySelector("#recording"),
    };

    function render(snapshot) {
      const hasRecording = snapshot.run.state === "completed" && snapshot.recordingUrl;
      if (hasRecording) {
        els.desktop.hidden = true;
        els.recording.hidden = false;
        if (!els.recording.src) els.recording.src = snapshot.recordingUrl;
      } else {
        els.recording.hidden = true;
        els.desktop.hidden = false;
        if (!els.desktop.src) els.desktop.src = snapshot.streamUrl;
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

    refresh();
    setInterval(refresh, 1200);
  </script>
</body>
</html>`;
