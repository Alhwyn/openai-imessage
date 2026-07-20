import { afterEach, describe, expect, test } from "bun:test";

import {
  clearMapsSessionsForTests,
  createMapsSession,
  createMapsViewerToken,
} from "../session";
import { handleMapsViewerRequest } from "../viewer";

const originalKey = process.env.GOOGLE_MAPS_API_KEY;
const originalSecret = process.env.MAPS_VIEWER_TOKEN_SECRET;

afterEach(() => {
  clearMapsSessionsForTests();
  if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  if (originalSecret === undefined) delete process.env.MAPS_VIEWER_TOKEN_SECRET;
  else process.env.MAPS_VIEWER_TOKEN_SECRET = originalSecret;
});

describe("maps viewer HTTP", () => {
  test("serves HTML and token-gated session JSON", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "browser-key";
    process.env.MAPS_VIEWER_TOKEN_SECRET = "viewer-secret";

    const session = createMapsSession({
      destinationName: "Beacon Hill Park",
      searchArea: "Victoria, BC",
      lat: 48.41,
      lng: -123.36,
    });
    const token = createMapsViewerToken(session.id)!;

    const page = handleMapsViewerRequest(
      new Request(`http://127.0.0.1/maps/${session.id}?token=${token}`),
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Waiting for your location");

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
      mapsApiKey: "browser-key",
    });

    const bad = handleMapsViewerRequest(
      new Request(`http://127.0.0.1/api/maps/${session.id}?token=wrong`),
    );
    expect(bad.status).toBe(404);
  });
});
