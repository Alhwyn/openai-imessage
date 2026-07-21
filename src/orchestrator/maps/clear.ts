import { clearFindMyWatchesForTests } from "./bindFindMyOrigin";
import { clearMapsSessionsForTests as clearSessions } from "./session";

export const clearMapsSessionsForTests = (): void => {
  clearFindMyWatchesForTests();
  clearSessions();
};
