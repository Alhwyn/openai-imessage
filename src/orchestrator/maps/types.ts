import type { Message, Space } from "@spectrum-ts/core";

export type LatLng = {
  lat: number;
  lng: number;
};

export type MapsSession = {
  id: string;
  destinationName: string;
  searchArea: string;
  lat: number;
  lng: number;
  createdAt: number;
  expiresAt: number;
  friendAddress?: string;
  originLat?: number;
  originLng?: number;
  originUpdatedAt?: number;
};

export type MapsLocationStatus = "shared" | "requested" | "unavailable";

export type CreateMapsSessionLinkInput = {
  destination: string;
  searchArea: string;
};

export type CreateMapsSessionLinkResult =
  | {
      status: "ok";
      url: string;
      destination: string;
      searchArea: string;
      sessionId: string;
    }
  | { status: "failed"; error: string };

export type CreateDirectionsLinkInput = CreateMapsSessionLinkInput & {
  space: Space;
  message: Message;
  senderId: string | null;
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
