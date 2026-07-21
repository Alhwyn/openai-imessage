import { clearFindMyWatchesForTests } from "./bindFindMyOrigin";
import { clearLocationClients } from "./locationClients";
import { clearMapsSessionsForTests as clearSessions } from "./session";

export const clearMapsSessionsForTests = (): void => {
  clearFindMyWatchesForTests();
  clearSessions();
  clearLocationClients();
};
