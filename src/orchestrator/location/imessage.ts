import {
  NotFoundError,
  type AdvancedIMessage,
} from "@photon-ai/advanced-imessage";

import {
  coarseFromShared,
  resolveSenderAddress,
  searchAreaFrom,
} from "./utils";

import type {
  GetMyLocationInput,
  GetMyLocationResult,
  IMessageRemoteClient,
  RequestMyLocationInput,
  RequestMyLocationResult,
} from "./types";
import type { Space, SpectrumInstance } from "@spectrum-ts/core";

let spectrumApp: SpectrumInstance | undefined;

/**
 * Registers the running Spectrum app so location tools can reach the Advanced
 * iMessage client managed by the iMessage provider.
 */
export const registerSpectrumApp = (app: SpectrumInstance): void => {
  spectrumApp = app;
};

/** Test helper: clear the registered Spectrum app. */
export const clearSpectrumApp = (): void => {
  spectrumApp = undefined;
};

const isRemoteClient = (value: unknown): value is IMessageRemoteClient => {
  if (!value || typeof value !== "object") return false;
  const entry = value as { client?: unknown; phone?: unknown };
  return (
    typeof entry.phone === "string" &&
    !!entry.client &&
    typeof entry.client === "object" &&
    "locations" in entry.client
  );
};

const getRemoteClients = (): IMessageRemoteClient[] | null => {
  if (!spectrumApp) return null;
  const runtime = spectrumApp.__internal.platforms.get("iMessage");
  if (!runtime) return null;
  if (!Array.isArray(runtime.client)) return null;
  const clients = runtime.client.filter(isRemoteClient);
  return clients.length > 0 ? clients : null;
};

const phoneFromSpace = (space: Space): string => {
  if (
    "phone" in space &&
    typeof space.phone === "string" &&
    space.phone.trim()
  ) return space.phone.trim();
  throw new Error("iMessage space is missing phone for location client routing");
};

const clientForSpace = (space: Space): AdvancedIMessage => {
  const clients = getRemoteClients();
  if (!clients) throw new Error("iMessage location client is not registered");

  const phone = phoneFromSpace(space);
  if (clients.length === 1 && clients[0]?.phone === "shared") return clients[0].client;

  const entry = clients.find((client) => client.phone === phone);
  if (!entry) {
    const available = clients.map((client) => client.phone).join(", ") || "<none>";
    throw new Error(
      `No iMessage client serves phone ${phone}. Available: ${available}`,
    );
  }
  return entry.client;
};

/**
 * Reads the sender's already-shared Find My location as a coarse snapshot.
 * Never returns exact latitude/longitude for downstream place search.
 */
export const getMyLocation = async (
  input: GetMyLocationInput,
): Promise<GetMyLocationResult> => {
  const address = resolveSenderAddress(input.message, input.senderId);
  if (!address) return { status: "no_sender" };

  let client: AdvancedIMessage;
  try {
    client = clientForSpace(input.space);
  } catch (error) {
    return {
      status: "client_unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const shared = await client.locations.get(address);
    const location = coarseFromShared(shared);

    if (location.isLocatingInProgress && !location.hasCoordinates) return { status: "locating", location };

    const searchArea = searchAreaFrom(location);
    if (!searchArea) return {
      status: "no_address_metadata",
      location,
      hint: "Ask for a city or neighborhood; do not invent a place from coordinates",
    };

    return { status: "ok", location, searchArea };
  } catch (error) {
    if (error instanceof NotFoundError) return { status: "not_shared" };
    return {
      status: "unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Sends a native Find My location-request card to the current sender.
 * Success means the card was sent, not that sharing was accepted.
 */
export const requestMyLocation = async (
  input: RequestMyLocationInput,
): Promise<RequestMyLocationResult> => {
  const address = resolveSenderAddress(input.message, input.senderId);
  if (!address) return { status: "no_sender" };

  let client: AdvancedIMessage;
  try {
    client = clientForSpace(input.space);
  } catch (error) {
    return {
      status: "client_unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const receipt = await client.locations.request(
      input.space.id,
      address,
      input.clientMessageId
        ? { clientMessageId: input.clientMessageId }
        : undefined,
    );
    return {
      status: "request_sent",
      address: receipt.address,
      serverStatus: receipt.status,
      messageGuid: receipt.messageGuid,
      reason: receipt.reason,
      note: "Find My request card sent; the person must accept or start sharing before get_my_location can read a location",
    };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
