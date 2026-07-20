import {
  clearSpectrumApp,
  getMyLocation,
  registerSpectrumApp,
  requestMyLocation,
} from "./imessage";
import {
  coarseFromShared,
  resolveSenderAddress,
  searchAreaFrom,
} from "./utils";

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
  getMyLocation,
  registerSpectrumApp,
  requestMyLocation,
  resolveSenderAddress,
  searchAreaFrom,
};
export type {
  CoarseSharedLocation,
  GetMyLocationInput,
  GetMyLocationResult,
  LocationType,
  RequestMyLocationInput,
  RequestMyLocationResult,
  SharedLocationSource,
};
