import type { CoarseSharedLocation, SharedLocationSource } from "./types";
import type { Message } from "@spectrum-ts/core";

/**
 * Resolves the Find My address for the current sender.
 * Prefers the iMessage `address` extra, then falls back to sender `id`.
 */
export const resolveSenderAddress = (
  message: Message,
  senderId: string | null,
): string | null => {
  const sender = message.sender;
  if (sender && typeof sender === "object") {
    if (
      "address" in sender &&
      typeof sender.address === "string" &&
      sender.address.trim()
    ) return sender.address.trim();
    if (typeof sender.id === "string" && sender.id.trim()) return sender.id.trim();
  }
  return senderId?.trim() || null;
};

const toIso = (value: Date | undefined): string | undefined => {
  if (!value) return undefined;
  return value.toISOString();
};

/**
 * Convert a shared location to a coarse shared location.
 * @param location - The shared location to convert.
 * @returns The coarse shared location.
 */
export const coarseFromShared = (
  location: SharedLocationSource,
): CoarseSharedLocation => ({
  address: location.address,
  locationType: location.locationType,
  isLocatingInProgress: location.isLocatingInProgress,
  hasCoordinates:
    location.latitude !== undefined && location.longitude !== undefined,
  shortAddress: location.shortAddress,
  longAddress: location.longAddress,
  name: location.name,
  locationTimestamp: toIso(location.locationTimestamp),
  expiresAt: toIso(location.expiresAt),
});

/** Picks a city/neighborhood string suitable for place search. */
export const searchAreaFrom = (location: CoarseSharedLocation): string | null => {
  const short = location.shortAddress?.trim();
  if (short) return short;
  const long = location.longAddress?.trim();
  if (long) return long;
  return null;
};
