import {
  ErrorCode,
  NotFoundError,
  type AdvancedIMessage,
} from "@photon-ai/advanced-imessage";
import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  clearSpectrumApp,
  getMyLocation,
  registerSpectrumApp,
  requestMyLocation,
  resolveSenderAddress,
} from "../index";

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

const makeClient = (locations: {
  get: ReturnType<typeof mock>;
  request: ReturnType<typeof mock>;
}): AdvancedIMessage =>
  ({ locations }) as unknown as AdvancedIMessage;

afterEach(() => {
  clearSpectrumApp();
  mock.restore();
});

describe("resolveSenderAddress", () => {
  test("prefers iMessage address extra over id", () => {
    expect(
      resolveSenderAddress(makeMessage("+15551111111", "+15552222222"), null),
    ).toBe("+15552222222");
  });

  test("falls back to sender id and then senderId arg", () => {
    expect(resolveSenderAddress(makeMessage("+15551111111"), null)).toBe(
      "+15551111111",
    );
    expect(resolveSenderAddress(makeMessage(null), "+15553333333")).toBe(
      "+15553333333",
    );
  });
});

describe("getMyLocation", () => {
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

    const result = await getMyLocation({
      space: makeSpace(),
      message: makeMessage("+15559876543"),
      senderId: "+15559876543",
    });

    expect(result).toEqual({ status: "not_shared" });
    expect(get).toHaveBeenCalledWith("+15559876543");
  });

  test("returns ok with coarse searchArea and no coordinates", async () => {
    const get = mock(() =>
      Promise.resolve({
        address: "+15559876543",
        isLocatingInProgress: false,
        locationType: "live" as const,
        latitude: 48.4284,
        longitude: -123.3656,
        shortAddress: "Victoria, BC",
        longAddress: "Victoria, British Columbia",
      }),
    );
    registerSpectrumApp(
      makeApp([
        {
          phone: "+15551234567",
          client: makeClient({ get, request: mock() }),
        },
      ]),
    );

    const result = await getMyLocation({
      space: makeSpace(),
      message: makeMessage("+15559876543"),
      senderId: "+15559876543",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.searchArea).toBe("Victoria, BC");
    expect(result.location.hasCoordinates).toBe(true);
    expect(result.location).not.toHaveProperty("latitude");
    expect(result.location).not.toHaveProperty("longitude");
  });

  test("returns locating when still locating without coordinates", async () => {
    const get = mock(() =>
      Promise.resolve({
        address: "+15559876543",
        isLocatingInProgress: true,
        locationType: "live" as const,
        shortAddress: "Victoria, BC",
      }),
    );
    registerSpectrumApp(
      makeApp([
        {
          phone: "+15551234567",
          client: makeClient({ get, request: mock() }),
        },
      ]),
    );

    const result = await getMyLocation({
      space: makeSpace(),
      message: makeMessage("+15559876543"),
      senderId: "+15559876543",
    });

    expect(result.status).toBe("locating");
  });

  test("returns no_address_metadata when only coordinates exist", async () => {
    const get = mock(() =>
      Promise.resolve({
        address: "+15559876543",
        isLocatingInProgress: false,
        locationType: "shallow" as const,
        latitude: 48.4,
        longitude: -123.3,
      }),
    );
    registerSpectrumApp(
      makeApp([
        {
          phone: "+15551234567",
          client: makeClient({ get, request: mock() }),
        },
      ]),
    );

    const result = await getMyLocation({
      space: makeSpace(),
      message: makeMessage("+15559876543"),
      senderId: "+15559876543",
    });

    expect(result.status).toBe("no_address_metadata");
  });

  test("returns client_unavailable when Spectrum is not registered", async () => {
    const result = await getMyLocation({
      space: makeSpace(),
      message: makeMessage("+15559876543"),
      senderId: "+15559876543",
    });
    expect(result.status).toBe("client_unavailable");
  });

  test("returns no_sender without a sender address", async () => {
    registerSpectrumApp(
      makeApp([
        {
          phone: "+15551234567",
          client: makeClient({ get: mock(), request: mock() }),
        },
      ]),
    );
    const result = await getMyLocation({
      space: makeSpace(),
      message: makeMessage(null),
      senderId: null,
    });
    expect(result).toEqual({ status: "no_sender" });
  });
});

describe("requestMyLocation", () => {
  test("sends request with chat guid, address, and idempotency key", async () => {
    const request = mock(() =>
      Promise.resolve({
        address: "+15559876543",
        status: "ok",
        messageGuid: "msg-guid-1",
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

    const space = makeSpace();
    const message = makeMessage("+15559876543");
    const result = await requestMyLocation({
      space,
      message,
      senderId: "+15559876543",
      clientMessageId: `location-request-${message.id}`,
    });

    expect(result.status).toBe("request_sent");
    if (result.status !== "request_sent") return;
    expect(result.note).toContain("must accept");
    expect(request).toHaveBeenCalledWith(space.id, "+15559876543", {
      clientMessageId: "location-request-msg-1",
    });
  });

  test("selects the client matching the space phone", async () => {
    const wrongRequest = mock(() =>
      Promise.resolve({ address: "wrong", status: "wrong" }),
    );
    const rightRequest = mock(() =>
      Promise.resolve({
        address: "+15559876543",
        status: "ok",
        messageGuid: "right",
      }),
    );
    registerSpectrumApp(
      makeApp([
        {
          phone: "+15550000001",
          client: makeClient({ get: mock(), request: wrongRequest }),
        },
        {
          phone: "+15551234567",
          client: makeClient({ get: mock(), request: rightRequest }),
        },
      ]),
    );

    const result = await requestMyLocation({
      space: makeSpace("+15551234567"),
      message: makeMessage("+15559876543"),
      senderId: "+15559876543",
    });

    expect(result.status).toBe("request_sent");
    expect(rightRequest).toHaveBeenCalled();
    expect(wrongRequest).not.toHaveBeenCalled();
  });
});
