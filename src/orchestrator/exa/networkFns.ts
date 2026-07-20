import Exa from "exa-js";

import { EXA_HIGHLIGHT_MAX_CHARS, EXA_MAX_RESULTS } from "./constants";

import type {
  ExaSearch,
  PlaceEvidence,
  SearchNearbyPlacesInput,
  SearchNearbyPlacesResult,
} from "./types";

let client: Exa | undefined;
let searchOverride: ExaSearch | undefined;

const getApiKey = (): string | null => process.env.EXA_API_KEY?.trim() || null;

const getSearch = (): ExaSearch => {
  if (searchOverride) return searchOverride;
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("EXA_API_KEY is not configured");
  client ??= new Exa(apiKey);
  return (query, options) => client!.search(query, options);
};

/** Test-only: clear cached client / search override. */
export const clearExaClient = (): void => {
  client = undefined;
  searchOverride = undefined;
};

/** Test-only: inject a fake Exa search. */
export const setExaSearchForTests = (fn: ExaSearch | undefined): void => {
  searchOverride = fn;
};

/** One Exa search for places near a coarse area. */
export const searchNearbyPlaces = async (
  input: SearchNearbyPlacesInput,
): Promise<SearchNearbyPlacesResult> => {
  const subject = input.subject.trim();
  const searchArea = input.searchArea.trim();
  if (!subject || !searchArea) return {
    status: "failed",
    error: "subject and searchArea are required",
  };

  if (!getApiKey()) return {
    status: "disabled",
    error: "EXA_API_KEY is not configured",
  };

  // Natural-language query (Exa: describe the ideal page, not keywords).
  const query = `where to find ${subject} near ${searchArea}`;

  try {
    const { results: hits } = await getSearch()(query, {
      type: "auto",
      numResults: EXA_MAX_RESULTS,
      contents: {
        highlights: {
          query,
          maxCharacters: EXA_HIGHLIGHT_MAX_CHARS,
        },
      },
    });

    const seen = new Set<string>();
    const results: PlaceEvidence[] = [];
    for (const hit of hits) {
      const url = hit.url?.trim();
      const title = hit.title?.trim();
      if (!url || !title || seen.has(url)) continue;
      seen.add(url);
      results.push({
        title,
        url,
        highlights: (hit.highlights ?? [])
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 3),
      });
      if (results.length >= EXA_MAX_RESULTS) break;
    }

    return { status: "ok", subject, searchArea, query, results };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
