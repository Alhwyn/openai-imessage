import {
  getFriendLocation,
  hasCoordinates,
  requestFriendLocation,
  watchFriendLocation,
  type GetFriendLocationResult,
} from "./findMy";
import {
  bindMapsSession,
  getLatestMapsSessionForFriend,
  getMapsSessionById,
  patchMapsSessionOrigin,
} from "./session";
import { resolveSenderAddress } from "./utils";

import type { LatLng, MapsLocationStatus, MapsSession } from "./types";
import type { Message, Space } from "@spectrum-ts/core";

const watches = new Map<string, AbortController>();

export const clearFindMyWatchesForTests = (): void => {
  for (const controller of watches.values()) controller.abort();
  watches.clear();
};

const stopWatch = (sessionId: string): void => {
  const existing = watches.get(sessionId);
  if (!existing) return;
  existing.abort();
  watches.delete(sessionId);
};

const startWatch = (sessionId: string, space: Space, address: string): void => {
  stopWatch(sessionId);
  const controller = new AbortController();
  watches.set(sessionId, controller);

  void watchFriendLocation({
    space,
    address,
    signal: controller.signal,
    onUpdate: (location) => {
      if (!hasCoordinates(location)) return;
      const ok = patchMapsSessionOrigin(sessionId, {
        lat: location.latitude,
        lng: location.longitude,
      });
      if (!ok || !getMapsSessionById(sessionId)) stopWatch(sessionId);
    },
  }).finally(() => {
    if (watches.get(sessionId) === controller) watches.delete(sessionId);
  });
};

type BindPlan =
  | { status: "unavailable" }
  | { status: "shared"; origin: LatLng }
  | { status: "requested"; origin?: LatLng; sendRequest: boolean };

export const planBindFindMyOrigin = (
  snapshot: GetFriendLocationResult,
  previous: MapsSession | null,
): BindPlan => {
  if (snapshot.status === "client_unavailable") return { status: "unavailable" };

  if (snapshot.status === "ok" && hasCoordinates(snapshot.location)) return {
    status: "shared",
    origin: {
      lat: snapshot.location.latitude,
      lng: snapshot.location.longitude,
    },
  };

  if (
    previous &&
    previous.originLat !== undefined &&
    previous.originLng !== undefined
  ) return {
    status: "shared",
    origin: { lat: previous.originLat, lng: previous.originLng },
  };

  if (previous) return { status: "requested", sendRequest: false };

  return { status: "requested", sendRequest: true };
};

export const bindFindMyOrigin = async (input: {
  sessionId: string;
  space: Space;
  message: Message;
  senderId: string | null;
}): Promise<MapsLocationStatus> => {
  const address = resolveSenderAddress(input.message, input.senderId);
  if (!address) return "unavailable";

  const previousSession = getLatestMapsSessionForFriend(
    address,
    input.sessionId,
  );
  const snapshot = await getFriendLocation({
    space: input.space,
    address,
  });
  const plan = planBindFindMyOrigin(snapshot, previousSession);

  if (plan.status === "unavailable") return "unavailable";

  bindMapsSession(input.sessionId, {
    friendAddress: address,
    origin: plan.origin,
  });
  startWatch(input.sessionId, input.space, address);

  if (plan.status === "shared") return "shared";

  if (!plan.sendRequest) return "requested";

  const requested = await requestFriendLocation({
    space: input.space,
    address,
  });
  if (requested.status === "request_sent") return "requested";

  console.warn("[maps] Find My share request did not send", {
    sessionId: input.sessionId,
    snapshotStatus: snapshot.status,
    requestStatus: requested.status,
    error: "error" in requested ? requested.error : undefined,
  });
  return "unavailable";
};
