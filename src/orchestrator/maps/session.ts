import { createHmac, timingSafeEqual } from "node:crypto";

import { MAPS_SESSION_TTL_MS } from "./constants";
import { readMapsSessions, writeMapsSessions } from "./sessionStore";

import type { MapsSession } from "./types";

const sessions = new Map<string, MapsSession>();
let hydrated = false;

const hydrate = (): void => {
  if (hydrated) return;
  hydrated = true;
  const now = Date.now();
  for (const session of readMapsSessions()) {
    if (session.expiresAt <= now) continue;
    sessions.set(session.id, session);
  }
};

const persist = (): void => {
  writeMapsSessions(sessions.values());
};

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
  let removed = false;
  for (const [id, session] of sessions) {
    if (session.expiresAt > now) continue;
    sessions.delete(id);
    removed = true;
  }
  if (removed) persist();
};

export const createMapsSession = (input: {
  destinationName: string;
  searchArea: string;
  lat: number;
  lng: number;
  friendAddress?: string;
}): MapsSession => {
  hydrate();
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
    friendAddress: input.friendAddress,
  };
  sessions.set(id, session);
  persist();
  return session;
};

export const getMapsSession = (
  sessionId: string,
  token: string,
): MapsSession | null => {
  hydrate();
  if (!verifyMapsViewerToken(sessionId, token)) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    persist();
    return null;
  }
  return session;
};

export const getMapsSessionById = (sessionId: string): MapsSession | null => {
  hydrate();
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    persist();
    return null;
  }
  return session;
};

export const getLatestMapsSessionForFriend = (
  friendAddress: string,
  excludeSessionId?: string,
): MapsSession | null => {
  hydrate();
  pruneExpired(Date.now());
  let latest: MapsSession | null = null;
  for (const session of sessions.values()) {
    if (
      session.id === excludeSessionId ||
      session.friendAddress !== friendAddress
    ) continue;
    if (
      !latest ||
      (session.originUpdatedAt ?? 0) > (latest.originUpdatedAt ?? 0)
    ) latest = session;
  }
  return latest;
};

export const patchMapsSessionOrigin = (
  sessionId: string,
  origin: { lat: number; lng: number },
): boolean => {
  const session = getMapsSessionById(sessionId);
  if (!session) return false;
  session.originLat = origin.lat;
  session.originLng = origin.lng;
  session.originUpdatedAt = Date.now();
  persist();
  return true;
};

export const setMapsSessionFriendAddress = (
  sessionId: string,
  friendAddress: string,
): boolean => {
  const session = getMapsSessionById(sessionId);
  if (!session) return false;
  session.friendAddress = friendAddress;
  persist();
  return true;
};

/** Drop in-memory sessions only (keep disk) — simulates process restart. */
export const resetMapsSessionsMemoryForTests = (): void => {
  sessions.clear();
  hydrated = false;
};

export const clearMapsSessionsForTests = (): void => {
  sessions.clear();
  hydrated = false;
  writeMapsSessions([]);
};
