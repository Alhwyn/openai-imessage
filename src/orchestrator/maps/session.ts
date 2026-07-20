import { createHmac, timingSafeEqual } from "node:crypto";

import { MAPS_SESSION_TTL_MS } from "./constants";

import type { MapsSession } from "./types";

const sessions = new Map<string, MapsSession>();

export const createMapsViewerToken = (sessionId: string): string | undefined => {
  const MAPS_VIEWER_TOKEN_SECRET =
    process.env.MAPS_VIEWER_TOKEN_SECRET?.trim() || undefined;
  if (!MAPS_VIEWER_TOKEN_SECRET) return undefined;
  return createHmac("sha256", MAPS_VIEWER_TOKEN_SECRET)
    .update(`maps:${sessionId}`)
    .digest("base64url");
};

export const verifyMapsViewerToken = (
  sessionId: string,
  token: string,
): boolean => {
  const expected = createMapsViewerToken(sessionId);
  if (!expected || !token) return false;
  const expectedBuf = Buffer.from(expected);
  const tokenBuf = Buffer.from(token);
  if (expectedBuf.length !== tokenBuf.length) return false;
  return timingSafeEqual(expectedBuf, tokenBuf);
};

const pruneExpired = (now: number): void => {
  for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
};

export const createMapsSession = (input: {
  destinationName: string;
  searchArea: string;
  lat: number;
  lng: number;
}): MapsSession => {
  const now = Date.now();
  pruneExpired(now);
  const id = crypto.randomUUID();
  const session: MapsSession = {
    id,
    destinationName: input.destinationName,
    searchArea: input.searchArea,
    lat: input.lat,
    lng: input.lng,
    expiresAt: now + MAPS_SESSION_TTL_MS,
  };
  sessions.set(id, session);
  return session;
};

export const getMapsSession = (
  sessionId: string,
  token: string,
): MapsSession | null => {
  if (!verifyMapsViewerToken(sessionId, token)) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
};

export const clearMapsSessionsForTests = (): void => {
  sessions.clear();
};
