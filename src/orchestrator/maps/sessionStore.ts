import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { MapsSession } from "./types";

/** Local JSON store for a single orchestrator process — not shared across replicas. */
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
    typeof row.expiresAt === "number" &&
    typeof row.createdAt === "number"
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
    const payload = JSON.stringify([...sessions]);
    const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, payload, "utf8");
    renameSync(tempPath, storePath);
  } catch (error) {
    console.error("[maps] Failed to persist sessions", error);
  }
};
