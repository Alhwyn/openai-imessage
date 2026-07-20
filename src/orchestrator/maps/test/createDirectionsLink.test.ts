import { afterEach, describe, expect, test } from "bun:test";

import { createDirectionsLink } from "../createDirectionsLink";
import { clearMapsSessionsForTests, getMapsSession } from "../session";

const originalBase = process.env.MAPS_PUBLIC_BASE_URL;
const originalKey = process.env.GOOGLE_MAPS_API_KEY;
const originalSecret = process.env.MAPS_VIEWER_TOKEN_SECRET;
const originalFetch = globalThis.fetch;

afterEach(() => {
  clearMapsSessionsForTests();
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.MAPS_PUBLIC_BASE_URL;
  else process.env.MAPS_PUBLIC_BASE_URL = originalBase;
  if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  if (originalSecret === undefined) delete process.env.MAPS_VIEWER_TOKEN_SECRET;
  else process.env.MAPS_VIEWER_TOKEN_SECRET = originalSecret;
});

describe("createDirectionsLink", () => {
  test("rejects empty destination or searchArea", async () => {
    expect(
      await createDirectionsLink({
        destination: "  ",
        searchArea: "Victoria, BC",
      }),
    ).toEqual({
      status: "failed",
      error: "destination and searchArea are required",
    });
    expect(
      await createDirectionsLink({
        destination: "Beacon Hill Park",
        searchArea: "",
      }),
    ).toEqual({
      status: "failed",
      error: "destination and searchArea are required",
    });
  });

  test("fails when maps env is missing", async () => {
    delete process.env.MAPS_PUBLIC_BASE_URL;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.MAPS_VIEWER_TOKEN_SECRET;
    const result = await createDirectionsLink({
      destination: "Beacon Hill Park",
      searchArea: "Victoria, BC",
    });
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toContain("GOOGLE_MAPS_API_KEY");
  });

  test("mints a hosted maps session URL after geocode", async () => {
    process.env.MAPS_PUBLIC_BASE_URL = "https://maps.alhwyn.com";
    process.env.GOOGLE_MAPS_API_KEY = "test-maps-key";
    process.env.MAPS_VIEWER_TOKEN_SECRET = "test-secret";

    globalThis.fetch = (() =>
      Promise.resolve(
        Response.json({
          status: "OK",
          results: [
            {
              geometry: { location: { lat: 48.4125, lng: -123.365 } },
            },
          ],
        }),
      )) as unknown as typeof fetch;

    const result = await createDirectionsLink({
      destination: "Beacon Hill Park",
      searchArea: "Victoria, BC",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const url = new URL(result.url);
    expect(url.origin).toBe("https://maps.alhwyn.com");
    expect(url.pathname.startsWith("/maps/")).toBe(true);
    const sessionId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
    const token = url.searchParams.get("token") ?? "";
    expect(token).toBeTruthy();
    expect(getMapsSession(sessionId, token)?.destinationName).toBe(
      "Beacon Hill Park",
    );
    expect(getMapsSession(sessionId, "bad")).toBeNull();
    expect(result.destination).toBe("Beacon Hill Park");
    expect(result.searchArea).toBe("Victoria, BC");
    expect(result.url).not.toContain("google.com/maps");
  });
});
