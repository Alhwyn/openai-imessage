import {
  ErrorCode,
  NotFoundError,
  type AdvancedIMessage,
  type SharedFriendLocation,
} from "@photon-ai/advanced-imessage";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { bindFindMyOrigin, clearFindMyWatchesForTests } from "../bindFindMyOrigin";
import {
  getFriendLocation,
  requestFriendLocation,
} from "../findMy";
import {
  clearLocationClients,
  registerLocationClients,
} from "../locationClients";
import {
  createMapsSession,
  getMapsSessionById,
  patchMapsSessionOrigin,
} from "../session";

import {
  disposeTempMapsSessionStore,
  useTempMapsSessionStore,
} from "./tmpStore";

import type { Message, Space } from "@spectrum-ts/core";

const makeSpace = (phone = "+15551234567"): Space =>
  ({
    id: "any;-;+15559876543",
    __platform: "iMessage",
    phone,
    type: "dm",
  }) as unknown as Space;

const makeMessage = (senderId: string | null, address?: string): Message =>
  ({
    id: "msg-1",
    platform: "iMessage",
    direction: "inbound",
    sender: senderId
      ? {
        id: senderId,
        __platform: "iMessage",
        ...(address ? { address } : {}),
      }
      : undefined,
    space: makeSpace(),
  }) as unknown as Message;

const emptyWatch = () => ({
  async *[Symbol.asyncIterator]() {
    // no updates
  },
  close: () => Promise.resolve(),
});

const makeClient = (locations: {
  get: ReturnType<typeof mock>;
  request: ReturnType<typeof mock>;
  watch?: ReturnType<typeof mock>;
}): AdvancedIMessage =>
  ({
    locations: {
      ...locations,
      watch: locations.watch ?? mock(() => emptyWatch()),
    },
  }) as unknown as AdvancedIMessage;

const registerClients = (
  clients: Array<{ phone: string; client: AdvancedIMessage }>,
): void => {
  registerLocationClients(clients);
};

beforeEach(() => {
  useTempMapsSessionStore();
});

afterEach(() => {
  clearFindMyWatchesForTests();
  disposeTempMapsSessionStore();
  clearLocationClients();
  mock.restore();
});

describe("getFriendLocation", () => {
  test("returns not_shared on NotFoundError", async () => {
    const get = mock(() =>
      Promise.reject(
        new NotFoundError("missing", {
          code: ErrorCode.sharedFriendLocationNotFound,
          grpcCode: 5,
          retryable: false,
        }),
      ),
    );
    registerClients([
      {
        phone: "+15551234567",
        client: makeClient({ get, request: mock() }),
      },
    ]);

    expect(
      await getFriendLocation({
        space: makeSpace(),
        address: "+15559876543",
      }),
    ).toEqual({ status: "not_shared" });
    expect(get).toHaveBeenCalledWith("+15559876543");
  });
});

describe("requestFriendLocation", () => {
  test("sends Find My request card", async () => {
    const request = mock(() =>
      Promise.resolve({
        address: "+15559876543",
        status: "sent",
        messageGuid: "guid-1",
      }),
    );
    registerClients([
      {
        phone: "+15551234567",
        client: makeClient({ get: mock(), request }),
      },
    ]);

    const result = await requestFriendLocation({
      space: makeSpace(),
      address: "+15559876543",
    });
    expect(result).toEqual({
      status: "request_sent",
      address: "+15559876543",
      serverStatus: "sent",
      messageGuid: "guid-1",
      reason: undefined,
    });
    expect(request).toHaveBeenCalledWith(
      "any;-;+15559876543",
      "+15559876543",
      undefined,
    );
  });
});

describe("bindFindMyOrigin", () => {
  test("patches session origin when Find My already has coordinates", async () => {
    const location: SharedFriendLocation = {
      address: "+15559876543",
      isLocatingInProgress: false,
      locationType: "live",
      latitude: 48.42,
      longitude: -123.37,
    };
    const get = mock(() => Promise.resolve(location));
    const request = mock(() => Promise.resolve({ address: "+15559876543", status: "sent" }));
    registerClients([
      {
        phone: "+15551234567",
        client: makeClient({ get, request }),
      },
    ]);

    const session = createMapsSession({
      destinationName: "Beacon Hill Park",
      searchArea: "Victoria, BC",
      lat: 48.41,
      lng: -123.36,
    });

    const status = await bindFindMyOrigin({
      sessionId: session.id,
      space: makeSpace(),
      message: makeMessage("+15559876543"),
      senderId: "+15559876543",
    });

    expect(status).toBe("shared");
    expect(request).not.toHaveBeenCalled();
    const updated = getMapsSessionById(session.id);
    expect(updated?.originLat).toBe(48.42);
    expect(updated?.originLng).toBe(-123.37);
    expect(updated?.friendAddress).toBe("+15559876543");
  });

  test("requests Find My share when not shared yet", async () => {
    const get = mock(() =>
      Promise.reject(
        new NotFoundError("missing", {
          code: ErrorCode.sharedFriendLocationNotFound,
          grpcCode: 5,
          retryable: false,
        }),
      ),
    );
    const request = mock(() =>
      Promise.resolve({
        address: "+15559876543",
        status: "sent",
        messageGuid: "guid-1",
      }),
    );
    registerClients([
      {
        phone: "+15551234567",
        client: makeClient({ get, request }),
      },
    ]);

    const session = createMapsSession({
      destinationName: "Beacon Hill Park",
      searchArea: "Victoria, BC",
      lat: 48.41,
      lng: -123.36,
    });

    const status = await bindFindMyOrigin({
      sessionId: session.id,
      space: makeSpace(),
      message: makeMessage("+15559876543"),
      senderId: "+15559876543",
    });

    expect(status).toBe("requested");
    expect(request).toHaveBeenCalled();
    expect(getMapsSessionById(session.id)?.originLat).toBeUndefined();
  });

  test("reuses a persisted location instead of requesting it again", async () => {
    const get = mock(() =>
      Promise.reject(
        new NotFoundError("missing", {
          code: ErrorCode.sharedFriendLocationNotFound,
          grpcCode: 5,
          retryable: false,
        }),
      ),
    );
    const request = mock(() =>
      Promise.resolve({
        address: "+15559876543",
        status: "sent",
      }),
    );
    registerClients([
      {
        phone: "+15551234567",
        client: makeClient({ get, request }),
      },
    ]);

    const previous = createMapsSession({
      destinationName: "Beacon Hill Park",
      searchArea: "Victoria, BC",
      lat: 48.41,
      lng: -123.36,
      friendAddress: "+15559876543",
    });
    patchMapsSessionOrigin(previous.id, { lat: 48.4, lng: -123.3 }, "flush");
    const current = createMapsSession({
      destinationName: "Fisherman's Wharf",
      searchArea: "Victoria, BC",
      lat: 48.42,
      lng: -123.38,
    });

    const status = await bindFindMyOrigin({
      sessionId: current.id,
      space: makeSpace(),
      message: makeMessage("+15559876543"),
      senderId: "+15559876543",
    });

    expect(status).toBe("shared");
    expect(request).not.toHaveBeenCalled();
    expect(getMapsSessionById(current.id)?.originLat).toBe(48.4);
    expect(getMapsSessionById(current.id)?.originLng).toBe(-123.3);
  });
});
