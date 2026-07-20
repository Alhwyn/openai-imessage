export const mapsViewerHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Directions</title>
  <style>
    * { box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #e8eaed; }
    .banner {
      display: none; position: absolute; z-index: 2; top: 12px; right: 12px; left: 12px;
      margin: 0; padding: 10px 12px; border-radius: 10px; font: 13px/1.35 ui-sans-serif, -apple-system, sans-serif;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
    }
    .banner.visible { display: block; }
    .banner.error { border: 1px solid #e8c8c3; color: #9a4034; background: #fff6f4; }
    .banner.info { border: 1px solid #c5d4e8; color: #1a3a5c; background: #f2f7fc; }
    .place {
      position: absolute; z-index: 2; left: 12px; right: 12px;
      bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      margin: 0; padding: 10px 12px; border-radius: 12px;
      background: rgba(255, 255, 255, 0.94); box-shadow: 0 2px 12px rgba(0, 0, 0, 0.14);
      font: 600 14px/1.3 ui-sans-serif, -apple-system, sans-serif;
    }
    .place span { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; color: #555; }
  </style>
</head>
<body>
  <p class="banner error" id="error"></p>
  <p class="banner info" id="info"></p>
  <p class="place" id="place" hidden></p>
  <div id="map"></div>
  <script>
    const sessionId = location.pathname.split("/").filter(Boolean).at(-1) || "";
    const token = new URLSearchParams(location.search).get("token") || "";
    const apiUrl = "/api/maps/" + encodeURIComponent(sessionId) + "?token=" + encodeURIComponent(token);
    const els = {
      map: document.querySelector("#map"),
      error: document.querySelector("#error"),
      info: document.querySelector("#info"),
      place: document.querySelector("#place"),
    };

    let map, youMarker, directionsRenderer, directionsService, lastRouteOrigin, destination;

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

    function fitAll(origin) {
      if (!map || !destination) return;
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(destination);
      if (origin) bounds.extend(origin);
      map.fitBounds(bounds, 64);
    }

    function updateRoute(origin) {
      if (!directionsService || !directionsRenderer || !destination) return;
      if (lastRouteOrigin && distanceMeters(lastRouteOrigin, origin) < 35) return;
      lastRouteOrigin = origin;
      directionsService.route(
        { origin, destination, travelMode: google.maps.TravelMode.WALKING },
        (result, status) => {
          if (status === "OK" && result) {
            directionsRenderer.setDirections(result);
            clearInfo();
            return;
          }
          fitAll(origin);
        },
      );
    }

    function onPosition(position) {
      const origin = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (!youMarker) {
        youMarker = new google.maps.Marker({
          map,
          position: origin,
          title: "You",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#4285F4",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
      } else {
        youMarker.setPosition(origin);
      }
      updateRoute(origin);
    }

    function startGeolocation() {
      if (!navigator.geolocation) {
        showInfo("Location is unavailable on this device. Showing destination only.");
        fitAll(null);
        return;
      }
      showInfo("Waiting for your location…");
      navigator.geolocation.watchPosition(
        onPosition,
        () => {
          showInfo("Allow location access to see your position and route.");
          fitAll(null);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    }

    function bootMap(session) {
      destination = { lat: session.lat, lng: session.lng };
      els.place.hidden = false;
      els.place.innerHTML = session.destinationName + "<span>" + session.searchArea + "</span>";
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
      startGeolocation();
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
