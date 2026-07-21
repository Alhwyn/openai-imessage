import { clearMapsSessionsForTests } from "./clear";
import {
  createDirectionsLink,
  createMapsSessionLink,
} from "./createDirectionsLink";
import {
  clearLocationClients,
  registerLocationClients,
} from "./locationClients";
import { startMapsViewer } from "./viewer";

import type { IMessageRemoteClient } from "./locationClients";
import type {
  CreateDirectionsLinkInput,
  CreateDirectionsLinkResult,
  CreateMapsSessionLinkInput,
  CreateMapsSessionLinkResult,
  MapsLocationStatus,
} from "./types";

export {
  clearLocationClients,
  clearMapsSessionsForTests,
  createDirectionsLink,
  createMapsSessionLink,
  registerLocationClients,
  startMapsViewer,
};
export type {
  CreateDirectionsLinkInput,
  CreateDirectionsLinkResult,
  CreateMapsSessionLinkInput,
  CreateMapsSessionLinkResult,
  IMessageRemoteClient,
  MapsLocationStatus,
};
