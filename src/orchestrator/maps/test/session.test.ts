import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  createMapsSession,
  createMapsViewerToken,
  getMapsSession,
  getMapsSessionById,
  patchMapsSessionOrigin,
  resetMapsSessionsMemoryForTests,
  verifyMapsViewerToken,
} from "../session";

import {
  disposeTempMapsSessionStore,
  useTempMapsSessionStore,
} from "./tmpStore";

const originalSecret = process.env.MAPS_VIEWER_TOKEN_SECRET;

beforeEach(() => {
  useTempMapsSessionStore();
});

afterEach(() => {
  disposeTempMapsSessionStore();
  if (originalSecret === undefined) delete process.env.MAPS_VIEWER_TOKEN_SECRET;
  else process.env.MAPS_VIEWER_TOKEN_SECRET = originalSecret;
});

describe("maps session tokens", () => {
  test("mints and verifies HMAC tokens", () => {
    process.env.MAPS_VIEWER_TOKEN_SECRET = "test-secret";
    const token = createMapsViewerToken("session-1");
    expect(token).toBeTruthy();
    expect(verifyMapsViewerToken("session-1", token!)).toBe(true);
    expect(verifyMapsViewerToken("session-1", "wrong")).toBe(false);
    expect(verifyMapsViewerToken("other", token!)).toBe(false);
  });

  test("rejects access without matching token", () => {
    process.env.MAPS_VIEWER_TOKEN_SECRET = "test-secret";
    const session = createMapsSession({
      destinationName: "Beacon Hill Park",
      searchArea: "Victoria, BC",
      lat: 48.41,
      lng: -123.36,
    });
    const token = createMapsViewerToken(session.id)!;
    expect(getMapsSession(session.id, token)?.destinationName).toBe(
      "Beacon Hill Park",
    );
    expect(getMapsSession(session.id, "bad-token")).toBeNull();
    expect(getMapsSession("missing", token)).toBeNull();
  });

  test("patches origin coordinates on a live session", () => {
    const session = createMapsSession({
      destinationName: "Beacon Hill Park",
      searchArea: "Victoria, BC",
      lat: 48.41,
      lng: -123.36,
    });
    expect(
      patchMapsSessionOrigin(session.id, { lat: 48.5, lng: -123.4 }, "flush"),
    ).toBe(true);
    const updated = getMapsSessionById(session.id);
    expect(updated?.originLat).toBe(48.5);
    expect(updated?.originLng).toBe(-123.4);
    expect(updated?.originUpdatedAt).toBeGreaterThan(0);
    expect(patchMapsSessionOrigin("missing", { lat: 1, lng: 2 })).toBe(false);
  });

  test("reloads persisted sessions after memory reset", () => {
    process.env.MAPS_VIEWER_TOKEN_SECRET = "test-secret";
    const session = createMapsSession({
      destinationName: "Beacon Hill Park",
      searchArea: "Victoria, BC",
      lat: 48.41,
      lng: -123.36,
    });
    const token = createMapsViewerToken(session.id)!;
    patchMapsSessionOrigin(session.id, { lat: 48.5, lng: -123.4 }, "flush");

    resetMapsSessionsMemoryForTests();

    const reloaded = getMapsSession(session.id, token);
    expect(reloaded?.destinationName).toBe("Beacon Hill Park");
    expect(reloaded?.originLat).toBe(48.5);
    expect(reloaded?.originLng).toBe(-123.4);
  });
});
