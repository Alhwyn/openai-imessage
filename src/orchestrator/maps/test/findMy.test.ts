import {
  ErrorCode,
  NotFoundError,
  type AdvancedIMessage,
  type SharedFriendLocation,
} from "@photon-ai/advanced-imessage";
import { afterEach, describe, expect, mock, test } from "bun:test";

import { bindFindMyOrigin, clearFindMyWatchesForTests } from "../bindFindMyOrigin";
import {
  getFriendLocation,
  requestFriendLocation,
} from "../findMy";
import { clearSpectrumApp, registerSpectrumApp } from "../imessage";
import {
  clearMapsSessionsForTests,
  createMapsSession,
  getMapsSessionById,
} from "../session";

import type { Message, Space, SpectrumInstance } from "@spectrum-ts/core";

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

const makeApp = (clients: Array<{ phone: string; client: AdvancedIMessage }>) =>
  ({
    __internal: {
      platforms: new Map([
        [
          "iMessage",
          {
            client: clients,
            config: {},
            definition: {},
            projectConfig: undefined,
            store: {},
            subscribeMessages: () => ({}),
          },
        ],
      ]),
    },
    __providers: [],
  }) as unknown as SpectrumInstance;

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

afterEach(() => {
  clearFindMyWatchesForTests();
  clearMapsSessionsForTests();
  clearSpectrumApp();
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
    registerSpectrumApp(
      makeApp([
        {
          phone: "+15551234567",
          client: makeClient({ get, request: mock() }),
        },
      ]),
    );

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
    registerSpectrumApp(
      makeApp([
        {
          phone: "+15551234567",
          client: makeClient({ get: mock(), request }),
        },
      ]),
    );

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
    registerSpectrumApp(
      makeApp([
        {
          phone: "+15551234567",
          client: makeClient({ get, request }),
        },
      ]),
    );

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
    registerSpectrumApp(
      makeApp([
        {
          phone: "+15551234567",
          client: makeClient({ get, request }),
        },
      ]),
    );

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
});
