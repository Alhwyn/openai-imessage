export type CreateDirectionsLinkInput = {
  /** Evidence-backed place name only (never invent). */
  destination: string;
  /** Coarse city/neighborhood used when searching. */
  searchArea: string;
};

export type CreateDirectionsLinkResult =
  | {
      status: "ok";
      url: string;
      destination: string;
      searchArea: string;
      note: string;
    }
  | { status: "failed"; error: string };

/**
 * Builds a keyless Google Maps navigation URL.
 * Omits origin so Maps uses the recipient device's live GPS.
 */
export const createDirectionsLink = (
  input: CreateDirectionsLinkInput,
): CreateDirectionsLinkResult => {
  const destination = input.destination.trim();
  const searchArea = input.searchArea.trim();
  if (!destination || !searchArea) return {
    status: "failed",
    error: "destination and searchArea are required",
  };

  const query = `${destination}, ${searchArea}`;
  const params = new URLSearchParams({
    api: "1",
    destination: query,
    dir_action: "navigate",
  });
  const url = `https://www.google.com/maps/dir/?${params.toString()}`;

  return {
    status: "ok",
    url,
    destination,
    searchArea,
    note: "Google Maps will use the recipient device location as origin; live GPS stays in Maps",
  };
};
