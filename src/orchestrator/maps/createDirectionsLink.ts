import { bindFindMyOrigin } from "./bindFindMyOrigin";
import { geocodePlace } from "./geocode";
import { createMapsSession, createMapsViewerToken } from "./session";
import { getMapsViewerPageUrl } from "./urls";

import type {
  CreateDirectionsLinkInput,
  CreateDirectionsLinkResult,
  CreateMapsSessionLinkInput,
  CreateMapsSessionLinkResult,
} from "./types";

/** Geocode + mint a hosted maps session URL (no Find My). */
export const createMapsSessionLink = async (
  input: CreateMapsSessionLinkInput,
): Promise<CreateMapsSessionLinkResult> => {
  const destination = input.destination.trim();
  const searchArea = input.searchArea.trim();
  if (!destination || !searchArea) return {
    status: "failed",
    error: "destination and searchArea are required",
  };

  const geocoded = await geocodePlace(`${destination}, ${searchArea}`);
  if (geocoded.status !== "ok") return { status: "failed", error: geocoded.error };

  const session = createMapsSession({
    destinationName: destination,
    searchArea,
    lat: geocoded.lat,
    lng: geocoded.lng,
  });
  const token = createMapsViewerToken(session.id);
  const url = token ? getMapsViewerPageUrl(session.id, token) : undefined;
  if (!url) return {
    status: "failed",
    error: "MAPS_PUBLIC_BASE_URL or MAPS_VIEWER_TOKEN_SECRET is not configured",
  };

  return {
    status: "ok",
    url,
    destination,
    searchArea,
    sessionId: session.id,
  };
};

/** Create a maps session link and bind Find My origin for the sender. */
export const createDirectionsLink = async (
  input: CreateDirectionsLinkInput,
): Promise<CreateDirectionsLinkResult> => {
  const link = await createMapsSessionLink(input);
  if (link.status !== "ok") return link;

  const locationStatus = await bindFindMyOrigin({
    sessionId: link.sessionId,
    space: input.space,
    message: input.message,
    senderId: input.senderId,
  });

  return {
    status: "ok",
    url: link.url,
    destination: link.destination,
    searchArea: link.searchArea,
    locationStatus,
  };
};
