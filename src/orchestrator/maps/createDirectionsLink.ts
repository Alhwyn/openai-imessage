import { bindFindMyOrigin } from "./bindFindMyOrigin";
import { geocodePlace } from "./geocode";
import { createMapsSession, createMapsViewerToken } from "./session";
import { getMapsViewerPageUrl } from "./urls";

import type {
  CreateDirectionsLinkInput,
  CreateDirectionsLinkResult,
  MapsLocationStatus,
} from "./types";

export const createDirectionsLink = async (
  input: CreateDirectionsLinkInput,
): Promise<CreateDirectionsLinkResult> => {
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

  let locationStatus: MapsLocationStatus = "unavailable";
  if (input.space && input.message) locationStatus = await bindFindMyOrigin({
    sessionId: session.id,
    space: input.space,
    message: input.message,
    senderId: input.senderId ?? null,
  });

  return { status: "ok", url, destination, searchArea, locationStatus };
};
