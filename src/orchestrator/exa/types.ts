export type PlaceEvidence = {
  title: string;
  url: string;
  highlights: string[];
};

export type SearchNearbyPlacesInput = {
  subject: string;
  /** Coarse area only (city/neighborhood). Never lat/lng. */
  searchArea: string;
};

export type SearchNearbyPlacesResult =
  | {
      status: "ok";
      subject: string;
      searchArea: string;
      query: string;
      results: PlaceEvidence[];
    }
  | { status: "disabled"; error: string }
  | { status: "failed"; error: string };

export type ExaHit = {
  title?: string | null;
  url?: string | null;
  highlights?: string[] | null;
};

export type ExaSearch = (
  query: string,
  options: {
    type: "auto";
    numResults: number;
    contents: { highlights: { query: string; maxCharacters: number } };
  },
) => Promise<{ results: ExaHit[] }>;
