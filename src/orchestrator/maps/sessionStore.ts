import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { MapsSession } from "./types";

const DEFAULT_PATH = join(
  import.meta.dir,
  "../../../.data/maps-sessions.json",
);

let storePath = DEFAULT_PATH;

export const setMapsSessionsPathForTests = (path: string | null): void => {
  storePath = path ?? DEFAULT_PATH;
};

const isSession = (value: unknown): value is MapsSession => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.destinationName === "string" &&
    typeof row.searchArea === "string" &&
    typeof row.lat === "number" &&
    typeof row.lng === "number" &&
    typeof row.expiresAt === "number"
  );
};

export const readMapsSessions = (): MapsSession[] => {
  try {
    const raw = readFileSync(storePath, "utf8");
    if (!raw.trim()) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSession);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) return [];
    console.error("[maps] Failed to load persisted sessions", error);
    return [];
  }
};

export const writeMapsSessions = (sessions: Iterable<MapsSession>): void => {
  try {
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath, JSON.stringify([...sessions]), "utf8");
  } catch (error) {
    console.error("[maps] Failed to persist sessions", error);
  }
};
