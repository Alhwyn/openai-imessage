/** Token-gated computer-use viewer UI (timeline + live Kasm iframe). */
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
    :root {
      color: #191919;
      background: #f7f7f5;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      font-synthesis: none;
    }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; background: #f7f7f5; font-size: 16px; }
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
    .events {
      display: flex;
      max-height: 360px;
      flex-direction: column;
      align-items: stretch;
      gap: 4px;
      overflow-y: auto;
      margin-top: 14px;
      padding: 0;
      scrollbar-width: thin;
    }
    .empty { padding: 10px 4px; color: #777; font-size: 17px; line-height: 1.4; }
    .event {
      min-width: 0;
      min-height: 28px;
      padding: 8px 4px;
      border-radius: 6px;
      color: #2f2f2c;
      cursor: pointer;
      font-size: 20px;
      font-weight: 500;
      line-height: 28px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: background .12s ease, color .12s ease;
    }
    .event:hover { background: #f3f3f1; color: #191919; }
    .event.selected { background: #e9e9e7; color: #191919; }
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
      .events { max-height: 280px; }
      .event { font-size: 18px; line-height: 26px; min-height: 26px; }
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
      <div class="events" id="events" aria-label="Agent activity"><div class="empty">Actions will appear here as the agent clicks, types, and moves through the task.</div></div>
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
        row.textContent = event.label;
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
