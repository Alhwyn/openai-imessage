import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearMapsSessionsForTests } from "../session";
import { setMapsSessionsPathForTests } from "../sessionStore";

let tempDir = "";

export const useTempMapsSessionStore = (): void => {
  tempDir = mkdtempSync(join(tmpdir(), "maps-session-"));
  setMapsSessionsPathForTests(join(tempDir, "sessions.json"));
  clearMapsSessionsForTests();
};

export const disposeTempMapsSessionStore = (): void => {
  clearMapsSessionsForTests();
  setMapsSessionsPathForTests(null);
  if (!tempDir) return;
  rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
};
