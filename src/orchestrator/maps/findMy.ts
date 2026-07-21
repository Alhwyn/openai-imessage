import {
  NotFoundError,
  type AdvancedIMessage,
  type SharedFriendLocation,
} from "@photon-ai/advanced-imessage";

import { clientForSpace } from "./locationClients";

import type { Space } from "@spectrum-ts/core";

export type GetFriendLocationResult =
  | { status: "ok"; location: SharedFriendLocation }
  | { status: "not_shared" }
  | { status: "client_unavailable"; error: string }
  | { status: "unavailable"; error: string };

export type RequestFriendLocationResult =
  | {
      status: "request_sent";
      address: string;
      serverStatus: string;
      messageGuid?: string;
      reason?: string;
    }
  | { status: "client_unavailable"; error: string }
  | { status: "failed"; error: string };

export const hasCoordinates = (
  location: SharedFriendLocation,
): location is SharedFriendLocation & { latitude: number; longitude: number } =>
  typeof location.latitude === "number" && typeof location.longitude === "number";

const resolveClient = (
  space: Space,
):
  | { status: "ok"; client: AdvancedIMessage }
  | { status: "client_unavailable"; error: string } => {
  try {
    return { status: "ok", client: clientForSpace(space) };
  } catch (error) {
    return {
      status: "client_unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const getFriendLocation = async (input: {
  space: Space;
  address: string;
}): Promise<GetFriendLocationResult> => {
  const resolved = resolveClient(input.space);
  if (resolved.status !== "ok") return resolved;

  try {
    const location = await resolved.client.locations.get(input.address);
    return { status: "ok", location };
  } catch (error) {
    if (error instanceof NotFoundError) return { status: "not_shared" };
    return {
      status: "unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const requestFriendLocation = async (input: {
  space: Space;
  address: string;
  clientMessageId?: string;
}): Promise<RequestFriendLocationResult> => {
  const resolved = resolveClient(input.space);
  if (resolved.status !== "ok") return resolved;

  try {
    const receipt = await resolved.client.locations.request(
      input.space.id,
      input.address,
      input.clientMessageId
        ? { clientMessageId: input.clientMessageId }
        : undefined,
    );
    return {
      status: "request_sent",
      address: receipt.address,
      serverStatus: receipt.status,
      messageGuid: receipt.messageGuid,
      reason: receipt.reason,
    };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const watchFriendLocation = async (input: {
  space: Space;
  address: string;
  onUpdate: (location: SharedFriendLocation) => void;
  signal: AbortSignal;
}): Promise<void> => {
  const resolved = resolveClient(input.space);
  if (resolved.status !== "ok") return;

  const stream = resolved.client.locations.watch(input.address);
  const onAbort = () => {
    void stream.close();
  };
  if (input.signal.aborted) {
    await stream.close();
    return;
  }
  input.signal.addEventListener("abort", onAbort, { once: true });

  try {
    for await (const update of stream) {
      if (input.signal.aborted) break;
      input.onUpdate(update.location);
    }
  } catch (error) {
    if (!input.signal.aborted) console.error("[maps] Find My watch failed", error);
  } finally {
    input.signal.removeEventListener("abort", onAbort);
    await stream.close().catch(() => undefined);
  }
};
