export type MapsSession = {
  id: string;
  destinationName: string;
  searchArea: string;
  lat: number;
  lng: number;
  expiresAt: number;
};

export type CreateDirectionsLinkInput = {
  destination: string;
  searchArea: string;
};

export type CreateDirectionsLinkResult =
  | {
      status: "ok";
      url: string;
      destination: string;
      searchArea: string;
    }
  | { status: "failed"; error: string };
