import {
  getFriendLocation,
  hasCoordinates,
  requestFriendLocation,
  watchFriendLocation,
} from "./findMy";
import {
  getMapsSessionById,
  patchMapsSessionOrigin,
  setMapsSessionFriendAddress,
} from "./session";
import { resolveSenderAddress } from "./utils";

import type { MapsLocationStatus } from "./types";
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

export const bindFindMyOrigin = async (input: {
  sessionId: string;
  space: Space;
  message: Message;
  senderId: string | null;
}): Promise<MapsLocationStatus> => {
  const address = resolveSenderAddress(input.message, input.senderId);
  if (!address) return "unavailable";

  setMapsSessionFriendAddress(input.sessionId, address);

  const snapshot = await getFriendLocation({
    space: input.space,
    address,
  });

  if (snapshot.status === "client_unavailable") return "unavailable";

  if (snapshot.status === "ok" && hasCoordinates(snapshot.location)) {
    patchMapsSessionOrigin(input.sessionId, {
      lat: snapshot.location.latitude,
      lng: snapshot.location.longitude,
    });
    startWatch(input.sessionId, input.space, address);
    return "shared";
  }

  const requested = await requestFriendLocation({
    space: input.space,
    address,
  });
  startWatch(input.sessionId, input.space, address);

  if (requested.status === "request_sent") return "requested";
  if (snapshot.status === "ok") return "requested";
  return "unavailable";
};
