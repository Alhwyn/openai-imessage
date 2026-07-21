export const mapsViewerHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Directions</title>
  <style>
    * { box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #e8eaed; }
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", ui-sans-serif, sans-serif; }
    .banner {
      display: none; position: absolute; z-index: 3; top: calc(12px + env(safe-area-inset-top, 0px));
      right: 12px; left: 12px; margin: 0; padding: 10px 12px; border-radius: 14px;
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, ui-sans-serif, sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    }
    .banner.visible { display: block; }
    .banner.error { border: 1px solid #e8c8c3; color: #9a4034; background: #fff6f4; }
    .banner.info { border: 1px solid #c5d4e8; color: #1a3a5c; background: #f2f7fc; }
    .trip {
      display: none; position: absolute; z-index: 2; left: 8px; right: 8px;
      bottom: calc(8px + env(safe-area-inset-bottom, 0px));
      align-items: center; gap: 8px; min-height: 48px; padding: 8px 8px 8px 6px;
      border-radius: 16px; background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14); backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    .trip.visible { display: flex; }
    .trip-metrics {
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 2px; flex: 1; min-width: 0; text-align: center;
    }
    .metric-value {
      display: block; color: #111; font-size: 14px; font-weight: 700;
      letter-spacing: -0.02em; line-height: 1.05;
    }
    .metric-label {
      display: block; margin-top: 1px; color: #8a8a8e;
      font-size: 9px; font-weight: 500; text-transform: lowercase;
    }
    .go {
      flex: 0 0 auto; width: 34px; height: 34px; padding: 0; border: 0;
      border-radius: 11px; color: white; background: #34c759;
      font: 700 12px/1 -apple-system, BlinkMacSystemFont, ui-sans-serif, sans-serif;
      cursor: pointer;
    }
    .go:active { transform: scale(0.96); background: #2db24e; }
    .go.cancel { background: #ff3b30; font-size: 18px; font-weight: 500; }
    .go.cancel:active { background: #e0342a; }
    /* Fullscreen / expanded Spectrum sheet: breathe a bit more. */
    @media (min-height: 420px) {
      .trip {
        left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px));
        min-height: 64px; padding: 10px 12px 10px 8px; border-radius: 22px; gap: 10px;
      }
      .metric-value { font-size: 20px; }
      .metric-label { font-size: 11px; margin-top: 2px; }
      .go { width: 44px; height: 44px; border-radius: 14px; font-size: 14px; }
      .go.cancel { font-size: 20px; }
    }
  </style>
</head>
<body>
  <p class="banner error" id="error"></p>
  <p class="banner info" id="info"></p>
  <div class="trip" id="trip" hidden>
    <div class="trip-metrics">
      <div>
        <strong class="metric-value" id="arrival-value">—</strong>
        <span class="metric-label">arrival</span>
      </div>
      <div>
        <strong class="metric-value" id="duration-value">—</strong>
        <span class="metric-label">min</span>
      </div>
      <div>
        <strong class="metric-value" id="distance-value">—</strong>
        <span class="metric-label" id="distance-label">km</span>
      </div>
    </div>
    <button class="go" id="go" type="button" hidden>GO</button>
  </div>
  <div id="map"></div>
  <script>
    const sessionId = location.pathname.split("/").filter(Boolean).at(-1) || "";
    const token = new URLSearchParams(location.search).get("token") || "";
    const apiUrl = "/api/maps/" + encodeURIComponent(sessionId) + "?token=" + encodeURIComponent(token);
    const els = {
      map: document.querySelector("#map"),
      error: document.querySelector("#error"),
      info: document.querySelector("#info"),
      trip: document.querySelector("#trip"),
      arrivalValue: document.querySelector("#arrival-value"),
      durationValue: document.querySelector("#duration-value"),
      distanceValue: document.querySelector("#distance-value"),
      distanceLabel: document.querySelector("#distance-label"),
      go: document.querySelector("#go"),
    };

    let map, youMarker, directionsRenderer, directionsService, lastRouteOrigin, destination;
    let navigationActive = false;
    let pollTimer;
    let lastOrigin = null;
    let headingDegrees = 0;

    function showError(message) {
      els.error.textContent = message;
      els.error.classList.add("visible");
      els.info.classList.remove("visible");
    }
    function showInfo(message) {
      els.info.textContent = message;
      els.info.classList.add("visible");
    }
    function clearInfo() { els.info.classList.remove("visible"); }

    function distanceMeters(a, b) {
      const toRad = (deg) => (deg * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * 6371000 * Math.asin(Math.sqrt(h));
    }

    function bearingDegrees(from, to) {
      const toRad = (deg) => (deg * Math.PI) / 180;
      const toDeg = (rad) => (rad * 180) / Math.PI;
      const lat1 = toRad(from.lat);
      const lat2 = toRad(to.lat);
      const dLng = toRad(to.lng - from.lng);
      const y = Math.sin(dLng) * Math.cos(lat2);
      const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
      return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    function youIcon(rotation) {
      return {
        // Rounded navigation chevron (points north at rotation 0).
        path: "M 0 -3.6 C 0.55 -3.6 1.15 -3.1 2.55 -0.35 C 3.15 0.85 3.35 1.55 3.05 2.05 C 2.75 2.55 2.15 2.55 1.35 2.15 L 0.35 1.55 C 0.15 1.45 -0.15 1.45 -0.35 1.55 L -1.35 2.15 C -2.15 2.55 -2.75 2.55 -3.05 2.05 C -3.35 1.55 -3.15 0.85 -2.55 -0.35 C -1.15 -3.1 -0.55 -3.6 0 -3.6 Z",
        scale: 7.5,
        fillColor: "#007AFF",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2.5,
        rotation,
        anchor: new google.maps.Point(0, 0.2),
      };
    }

    function formatDistance(meters) {
      if (!Number.isFinite(meters)) return { value: "—", label: "km" };
      if (meters < 1000) return { value: String(Math.max(1, Math.round(meters))), label: "m" };
      const km = meters / 1000;
      return {
        value: km >= 10 ? String(Math.round(km)) : km.toFixed(1).replace(/\\.0$/, ""),
        label: "km",
      };
    }

    function formatDurationMinutes(seconds) {
      if (!Number.isFinite(seconds)) return "—";
      return String(Math.max(1, Math.round(seconds / 60)));
    }

    function fitAll(origin) {
      if (!map || !destination) return;
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(destination);
      if (origin) bounds.extend(origin);
      map.fitBounds(bounds, 64);
    }

    function followOrigin(origin) {
      if (!map || !origin) return;
      map.setZoom(18);
      map.panTo(origin);
    }

    function syncNavigationButton() {
      els.go.textContent = navigationActive ? "×" : "GO";
      els.go.classList.toggle("cancel", navigationActive);
      els.go.setAttribute(
        "aria-label",
        navigationActive ? "Cancel live navigation" : "Start live navigation",
      );
    }

    function updateTripSummary(leg) {
      const arrival = new Date(
        Date.now() + (leg.duration?.value || 0) * 1000,
      ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const distance = formatDistance(leg.distance?.value);
      els.arrivalValue.textContent = arrival;
      els.durationValue.textContent = formatDurationMinutes(leg.duration?.value);
      els.distanceValue.textContent = distance.value;
      els.distanceLabel.textContent = distance.label;
      els.trip.hidden = false;
      els.trip.classList.add("visible");
      els.go.hidden = false;
      syncNavigationButton();
    }

    function updateRoute(origin) {
      if (!directionsService || !directionsRenderer || !destination) return;
      if (lastRouteOrigin && distanceMeters(lastRouteOrigin, origin) < 35) {
        if (navigationActive) followOrigin(origin);
        return;
      }
      lastRouteOrigin = origin;
      directionsService.route(
        { origin, destination, travelMode: google.maps.TravelMode.WALKING },
        (result, status) => {
          if (status === "OK" && result) {
            directionsRenderer.setDirections(result);
            const leg = result.routes?.[0]?.legs?.[0];
            if (leg) updateTripSummary(leg);
            if (navigationActive) followOrigin(origin);
            return;
          }
          fitAll(origin);
        },
      );
    }

    function syncYouHeading(origin) {
      if (lastOrigin && distanceMeters(lastOrigin, origin) >= 4)
        headingDegrees = bearingDegrees(lastOrigin, origin);
      else if (destination) headingDegrees = bearingDegrees(origin, destination);
      lastOrigin = origin;
    }

    function onOrigin(origin) {
      syncYouHeading(origin);
      if (!youMarker) {
        youMarker = new google.maps.Marker({
          map,
          position: origin,
          title: "You",
          icon: youIcon(headingDegrees),
        });
      } else {
        youMarker.setPosition(origin);
        youMarker.setIcon(youIcon(headingDegrees));
      }
      updateRoute(origin);
      if (navigationActive) followOrigin(origin);
    }

    async function loadSession() {
      const response = await fetch(apiUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(
        response.status === 404
          ? "This map link is invalid or expired."
          : "Could not load the map session.",
      );
      return response.json();
    }

    function schedulePoll(hasOrigin) {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(pollOrigin, hasOrigin ? 5000 : 2500);
    }

    async function pollOrigin() {
      try {
        const session = await loadSession();
        if (
          typeof session.originLat === "number" &&
          typeof session.originLng === "number"
        ) {
          onOrigin({ lat: session.originLat, lng: session.originLng });
          schedulePoll(true);
          return;
        }
        showInfo("Waiting for Find My location… Accept the share request in Messages if you see one.");
        fitAll(null);
        schedulePoll(false);
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    }

    function bootMap(session) {
      destination = { lat: session.lat, lng: session.lng };
      els.trip.hidden = false;
      els.trip.classList.add("visible");
      els.arrivalValue.textContent = "—";
      els.durationValue.textContent = "—";
      els.distanceValue.textContent = "—";
      els.distanceLabel.textContent = "km";
      els.go.hidden = false;
      syncNavigationButton();
      map = new google.maps.Map(els.map, {
        center: destination,
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
      });
      new google.maps.Marker({ map, position: destination, title: session.destinationName });
      directionsService = new google.maps.DirectionsService();
      directionsRenderer = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        preserveViewport: false,
      });
      const hasOrigin =
        typeof session.originLat === "number" &&
        typeof session.originLng === "number";
      google.maps.event.addListenerOnce(map, "tilesloaded", () => {
        if (hasOrigin) clearInfo();
        else showInfo("Waiting for Find My location…");
      });
      if (hasOrigin) {
        onOrigin({ lat: session.originLat, lng: session.originLng });
        schedulePoll(true);
        return;
      }
      showInfo("Waiting for Find My location… Accept the share request in Messages if you see one.");
      fitAll(null);
      schedulePoll(false);
    }

    function loadMapsScript(apiKey) {
      return new Promise((resolve, reject) => {
        if (window.google?.maps) return resolve();
        const script = document.createElement("script");
        script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(apiKey);
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Google Maps."));
        document.head.appendChild(script);
      });
    }

    els.go.addEventListener("click", () => {
      navigationActive = !navigationActive;
      syncNavigationButton();
      if (navigationActive) followOrigin(lastRouteOrigin);
      else fitAll(lastRouteOrigin || null);
    });
    showInfo("Loading map…");
    (async () => {
      try {
        if (!sessionId || !token) throw new Error("This map link is invalid or expired.");
        const session = await loadSession();
        await loadMapsScript(session.mapsApiKey);
        bootMap(session);
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    })();
  </script>
</body>
</html>`;
