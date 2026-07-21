import {
  type AdvancedIMessage,
  type SharedFriendLocation,
} from "@photon-ai/advanced-imessage";
import { afterEach, describe, expect, mock, test } from "bun:test";

import { clearFindMyWatchesForTests } from "../bindFindMyOrigin";
import { createDirectionsLink } from "../createDirectionsLink";
import { clearSpectrumApp, registerSpectrumApp } from "../imessage";
import {
  clearMapsSessionsForTests,
  getMapsSession,
  getMapsSessionById,
} from "../session";

import type { Message, Space, SpectrumInstance } from "@spectrum-ts/core";

const originalBase = process.env.MAPS_PUBLIC_BASE_URL;
const originalKey = process.env.GOOGLE_MAPS_API_KEY;
const originalSecret = process.env.MAPS_VIEWER_TOKEN_SECRET;
const originalFetch = globalThis.fetch;

const makeSpace = (): Space =>
  ({
    id: "any;-;+15559876543",
    __platform: "iMessage",
    phone: "+15551234567",
    type: "dm",
  }) as unknown as Space;

const makeMessage = (): Message =>
  ({
    id: "msg-1",
    platform: "iMessage",
    direction: "inbound",
    sender: {
      id: "+15559876543",
      __platform: "iMessage",
      address: "+15559876543",
    },
    space: makeSpace(),
  }) as unknown as Message;

const emptyWatch = () => ({
  async *[Symbol.asyncIterator]() {},
  close: () => Promise.resolve(),
});

const makeApp = (client: AdvancedIMessage) =>
  ({
    __internal: {
      platforms: new Map([
        [
          "iMessage",
          {
            client: [{ phone: "+15551234567", client }],
            config: {},
            definition: {},
            projectConfig: undefined,
            store: {},
            subscribeMessages: () => ({}),
          },
        ],
      ]),
    },
    __providers: [],
  }) as unknown as SpectrumInstance;

afterEach(() => {
  clearFindMyWatchesForTests();
  clearMapsSessionsForTests();
  clearSpectrumApp();
  mock.restore();
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
    expect(result.locationStatus).toBe("unavailable");
    expect(result.url).not.toContain("google.com/maps");
  });

  test("binds Find My origin into the session when sharing is active", async () => {
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

    const location: SharedFriendLocation = {
      address: "+15559876543",
      isLocatingInProgress: false,
      locationType: "live",
      latitude: 48.42,
      longitude: -123.37,
    };
    registerSpectrumApp(
      makeApp({
        locations: {
          get: mock(() => Promise.resolve(location)),
          request: mock(),
          watch: mock(() => emptyWatch()),
        },
      } as unknown as AdvancedIMessage),
    );

    const result = await createDirectionsLink({
      destination: "Beacon Hill Park",
      searchArea: "Victoria, BC",
      space: makeSpace(),
      message: makeMessage(),
      senderId: "+15559876543",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.locationStatus).toBe("shared");
    const url = new URL(result.url);
    const sessionId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
    const session = getMapsSessionById(sessionId);
    expect(session?.originLat).toBe(48.42);
    expect(session?.originLng).toBe(-123.37);
  });
});
