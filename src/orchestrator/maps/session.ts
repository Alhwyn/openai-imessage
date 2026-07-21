import { createHmac, timingSafeEqual } from "node:crypto";

import { MAPS_SESSION_TTL_MS } from "./constants";
import { readMapsSessions, writeMapsSessions } from "./sessionStore";

import type { LatLng, MapsSession } from "./types";

const PERSIST_DEBOUNCE_MS = 500;

const sessions = new Map<string, MapsSession>();
let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

const hydrate = (): void => {
  if (hydrated) return;
  hydrated = true;
  const now = Date.now();
  for (const session of readMapsSessions()) {
    if (session.expiresAt <= now) continue;
    sessions.set(session.id, session);
  }
};

const flushPersist = (): void => {
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  writeMapsSessions(sessions.values());
};

const schedulePersist = (): void => {
  if (persistTimer !== undefined) return;
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    writeMapsSessions(sessions.values());
  }, PERSIST_DEBOUNCE_MS);
};

export const createMapsViewerToken = (sessionId: string): string | undefined => {
  const secret = process.env.MAPS_VIEWER_TOKEN_SECRET?.trim() || undefined;
  if (!secret) return undefined;
  return createHmac("sha256", secret)
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

const pruneExpired = (now: number): boolean => {
  let removed = false;
  for (const [id, session] of sessions) {
    if (session.expiresAt > now) continue;
    sessions.delete(id);
    removed = true;
  }
  return removed;
};

const snapshot = (session: MapsSession): MapsSession => ({ ...session });

type PersistMode = "flush" | "debounce";

const replaceSession = (
  next: MapsSession,
  persist: PersistMode,
): MapsSession => {
  sessions.set(next.id, next);
  if (persist === "flush") flushPersist();
  else schedulePersist();
  return snapshot(next);
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
  if (pruneExpired(now)) flushPersist();
  const id = crypto.randomUUID();
  return replaceSession(
    {
      id,
      destinationName: input.destinationName,
      searchArea: input.searchArea,
      lat: input.lat,
      lng: input.lng,
      createdAt: now,
      expiresAt: now + MAPS_SESSION_TTL_MS,
      friendAddress: input.friendAddress,
    },
    "flush",
  );
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
    flushPersist();
    return null;
  }
  return snapshot(session);
};

export const getMapsSessionById = (sessionId: string): MapsSession | null => {
  hydrate();
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    flushPersist();
    return null;
  }
  return snapshot(session);
};

const friendSessionScore = (session: MapsSession): number =>
  session.originUpdatedAt ?? session.createdAt;

export const getLatestMapsSessionForFriend = (
  friendAddress: string,
  excludeSessionId?: string,
): MapsSession | null => {
  hydrate();
  if (pruneExpired(Date.now())) flushPersist();
  let latest: MapsSession | null = null;
  for (const session of sessions.values()) {
    if (session.id === excludeSessionId || session.friendAddress !== friendAddress) continue;
    if (!latest || friendSessionScore(session) > friendSessionScore(latest)) latest = session;
  }
  return latest ? snapshot(latest) : null;
};

export const updateMapsSession = (
  sessionId: string,
  patch: Partial<Omit<MapsSession, "id">>,
  persist: PersistMode = "flush",
): MapsSession | null => {
  const session = getMapsSessionById(sessionId);
  if (!session) return null;
  return replaceSession({ ...session, ...patch }, persist);
};

export const bindMapsSession = (
  sessionId: string,
  input: { friendAddress: string; origin?: LatLng },
): MapsSession | null => {
  const patch: Partial<Omit<MapsSession, "id">> = {
    friendAddress: input.friendAddress,
  };
  if (input.origin) {
    patch.originLat = input.origin.lat;
    patch.originLng = input.origin.lng;
    patch.originUpdatedAt = Date.now();
  }
  return updateMapsSession(sessionId, patch, "flush");
};

export const patchMapsSessionOrigin = (
  sessionId: string,
  origin: LatLng,
  persist: PersistMode = "debounce",
): boolean =>
  updateMapsSession(
    sessionId,
    {
      originLat: origin.lat,
      originLng: origin.lng,
      originUpdatedAt: Date.now(),
    },
    persist,
  ) !== null;

/** Drop in-memory sessions only (keep disk) — simulates process restart. */
export const resetMapsSessionsMemoryForTests = (): void => {
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  sessions.clear();
  hydrated = false;
};

export const clearMapsSessionsForTests = (): void => {
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  sessions.clear();
  hydrated = false;
  writeMapsSessions([]);
};
