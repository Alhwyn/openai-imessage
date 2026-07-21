import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  createMapsSession,
  createMapsViewerToken,
  patchMapsSessionOrigin,
} from "../session";
import { handleMapsViewerRequest } from "../viewer";
import { mapsViewerHtml } from "../viewerPage";

import {
  disposeTempMapsSessionStore,
  useTempMapsSessionStore,
} from "./tmpStore";

const originalKey = process.env.GOOGLE_MAPS_API_KEY;
const originalSecret = process.env.MAPS_VIEWER_TOKEN_SECRET;

beforeEach(() => {
  useTempMapsSessionStore();
});

afterEach(() => {
  disposeTempMapsSessionStore();
  if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  if (originalSecret === undefined) delete process.env.MAPS_VIEWER_TOKEN_SECRET;
  else process.env.MAPS_VIEWER_TOKEN_SECRET = originalSecret;
});

describe("maps viewer HTTP", () => {
  test("viewer page polls Find My origin instead of browser geolocation", () => {
    expect(mapsViewerHtml).not.toContain("geolocation");
    expect(mapsViewerHtml).toContain("Waiting for Find My location");
    expect(mapsViewerHtml).toContain('showInfo("Loading map…")');
    expect(mapsViewerHtml).toContain('"tilesloaded"');
    expect(mapsViewerHtml).toContain('id="go"');
    expect(mapsViewerHtml).not.toContain('id="maneuver"');
    expect(mapsViewerHtml).toContain('id="trip"');
    expect(mapsViewerHtml).toContain('id="arrival-value"');
    expect(mapsViewerHtml).toContain('id="duration-value"');
    expect(mapsViewerHtml).toContain('id="distance-value"');
    expect(mapsViewerHtml).toContain(
      'navigationActive ? "Cancel live navigation" : "Start live navigation"',
    );
    expect(mapsViewerHtml).toContain("let navigationActive = false");
    expect(mapsViewerHtml).toContain("map.setZoom(18)");
    expect(mapsViewerHtml).toContain("pollOrigin");
    expect(mapsViewerHtml).toContain('fillColor: "#007AFF"');
    expect(mapsViewerHtml).toContain("Rounded navigation chevron");
    expect(mapsViewerHtml).toContain("scale: 7.5");
    expect(mapsViewerHtml).toContain("bearingDegrees");
    expect(mapsViewerHtml).toContain("headingDegrees");
  });

  test("serves HTML and token-gated session JSON", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "browser-key";
    process.env.MAPS_VIEWER_TOKEN_SECRET = "viewer-secret";

    const session = createMapsSession({
      destinationName: "Beacon Hill Park",
      searchArea: "Victoria, BC",
      lat: 48.41,
      lng: -123.36,
    });
    patchMapsSessionOrigin(session.id, { lat: 48.42, lng: -123.37 }, "flush");
    const token = createMapsViewerToken(session.id)!;

    const page = handleMapsViewerRequest(
      new Request(`http://127.0.0.1/maps/${session.id}?token=${token}`),
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Waiting for Find My location");

    const ok = handleMapsViewerRequest(
      new Request(
        `http://127.0.0.1/api/maps/${session.id}?token=${encodeURIComponent(token)}`,
      ),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      destinationName: "Beacon Hill Park",
      searchArea: "Victoria, BC",
      lat: 48.41,
      lng: -123.36,
      originLat: 48.42,
      originLng: -123.37,
      mapsApiKey: "browser-key",
    });

    const bad = handleMapsViewerRequest(
      new Request(`http://127.0.0.1/api/maps/${session.id}?token=wrong`),
    );
    expect(bad.status).toBe(404);
  });
});
