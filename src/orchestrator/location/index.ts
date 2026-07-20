import {
  clearSpectrumApp,
  getMyLocation,
  registerSpectrumApp,
  requestMyLocation,
} from "./imessage";
import { createDirectionsLink } from "./maps";
import {
  coarseFromShared,
  resolveSenderAddress,
  searchAreaFrom,
} from "./utils";

import type {
  CreateDirectionsLinkInput,
  CreateDirectionsLinkResult,
} from "./maps";
import type {
  CoarseSharedLocation,
  GetMyLocationInput,
  GetMyLocationResult,
  LocationType,
  RequestMyLocationInput,
  RequestMyLocationResult,
  SharedLocationSource,
} from "./types";

export {
  clearSpectrumApp,
  coarseFromShared,
  createDirectionsLink,
  getMyLocation,
  registerSpectrumApp,
  requestMyLocation,
  resolveSenderAddress,
  searchAreaFrom,
};
export type {
  CoarseSharedLocation,
  CreateDirectionsLinkInput,
  CreateDirectionsLinkResult,
  GetMyLocationInput,
  GetMyLocationResult,
  LocationType,
  RequestMyLocationInput,
  RequestMyLocationResult,
  SharedLocationSource,
};
