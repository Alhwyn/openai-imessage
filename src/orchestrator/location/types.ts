import type { AdvancedIMessage } from "@photon-ai/advanced-imessage";
import type { Message, Space } from "@spectrum-ts/core";

export type IMessageRemoteClient = {
  client: AdvancedIMessage;
  phone: string;
};

export type LocationType = "legacy" | "live" | "shallow" | "unknown";

/** Coarse location snapshot safe for agent/tool use (no exact coordinates). */
export type CoarseSharedLocation = {
  address: string;
  locationType: LocationType;
  isLocatingInProgress: boolean;
  hasCoordinates: boolean;
  shortAddress?: string;
  longAddress?: string;
  name?: string;
  locationTimestamp?: string;
  expiresAt?: string;
};

/** Photon shared location fields used when building a coarse snapshot. */
export type SharedLocationSource = {
  address: string;
  locationType: LocationType;
  isLocatingInProgress: boolean;
  latitude?: number;
  longitude?: number;
  shortAddress?: string;
  longAddress?: string;
  name?: string;
  locationTimestamp?: Date;
  expiresAt?: Date;
};

export type GetMyLocationInput = {
  space: Space;
  message: Message;
  senderId: string | null;
};

export type RequestMyLocationInput = {
  space: Space;
  message: Message;
  senderId: string | null;
  clientMessageId?: string;
};

export type GetMyLocationResult =
  | {
      status: "ok";
      location: CoarseSharedLocation;
      /** Coarse area string suitable for place search (never lat/lng). */
      searchArea: string;
    }
  | { status: "not_shared" }
  | { status: "locating"; location: CoarseSharedLocation }
  | {
      status: "no_address_metadata";
      location: CoarseSharedLocation;
      hint: string;
    }
  | { status: "no_sender" }
  | { status: "client_unavailable"; error: string }
  | { status: "unavailable"; error: string };

export type RequestMyLocationResult =
  | {
      status: "request_sent";
      address: string;
      serverStatus: string;
      messageGuid?: string;
      reason?: string;
      note: string;
    }
  | { status: "no_sender" }
  | { status: "client_unavailable"; error: string }
  | { status: "failed"; error: string; reason?: string };
