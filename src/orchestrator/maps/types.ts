import type { Message, Space } from "@spectrum-ts/core";

export type MapsSession = {
  id: string;
  destinationName: string;
  searchArea: string;
  lat: number;
  lng: number;
  expiresAt: number;
  friendAddress?: string;
  originLat?: number;
  originLng?: number;
  originUpdatedAt?: number;
};

export type MapsLocationStatus = "shared" | "requested" | "unavailable";

export type CreateDirectionsLinkInput = {
  destination: string;
  searchArea: string;
  space?: Space;
  message?: Message;
  senderId?: string | null;
};

export type CreateDirectionsLinkResult =
  | {
      status: "ok";
      url: string;
      destination: string;
      searchArea: string;
      locationStatus: MapsLocationStatus;
    }
  | { status: "failed"; error: string };
