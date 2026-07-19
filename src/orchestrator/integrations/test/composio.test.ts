import { afterEach, describe, expect, test } from "bun:test";

import {
  composioUserIdFor,
  getComposioTools,
  isComposioAuthUrl,
} from "../composio";

const originalApiKey = process.env.COMPOSIO_API_KEY;
const originalSalt = process.env.COMPOSIO_USER_ID_SALT;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = originalApiKey;

  if (originalSalt === undefined) delete process.env.COMPOSIO_USER_ID_SALT;
  else process.env.COMPOSIO_USER_ID_SALT = originalSalt;
});

describe("composioUserIdFor", () => {
  test("is stable without exposing the sender identity", () => {
    const first = composioUserIdFor("sender-123", "salt-a");
    const second = composioUserIdFor("sender-123", "salt-a");

    expect(first).toBe(second);
    expect(first).toMatch(/^imessage_[a-f0-9]{64}$/);
    expect(first).not.toContain("sender-123");
  });

  test("isolates identities and salts", () => {
    expect(composioUserIdFor("sender-a", "salt-a")).not.toBe(
      composioUserIdFor("sender-b", "salt-a"),
    );
    expect(composioUserIdFor("sender-a", "salt-a")).not.toBe(
      composioUserIdFor("sender-a", "salt-b"),
    );
  });
});

describe("getComposioTools", () => {
  test("returns no tools without sender identity", async () => {
    expect(await getComposioTools(null)).toEqual({});
  });

  test("returns no tools when Composio is disabled", async () => {
    delete process.env.COMPOSIO_API_KEY;
    delete process.env.COMPOSIO_USER_ID_SALT;

    expect(await getComposioTools("sender-123")).toEqual({});
  });

  test("fails open when the salt is missing", async () => {
    process.env.COMPOSIO_API_KEY = "test-key";
    delete process.env.COMPOSIO_USER_ID_SALT;

    expect(await getComposioTools("sender-123")).toEqual({});
  });
});

describe("isComposioAuthUrl", () => {
  test("accepts https connect.composio.dev links", () => {
    expect(isComposioAuthUrl("https://connect.composio.dev/link/ln_abc123")).toBe(
      true,
    );
  });

  test("rejects insecure, non-connect, or credentialed urls", () => {
    expect(isComposioAuthUrl("http://connect.composio.dev/link/ln_abc123")).toBe(
      false,
    );
    expect(isComposioAuthUrl("https://backend.composio.dev/api/v3/auth")).toBe(
      false,
    );
    expect(isComposioAuthUrl("https://evil.com/connect.composio.dev")).toBe(
      false,
    );
    expect(
      isComposioAuthUrl("https://user:pass@connect.composio.dev/link/ln_abc123"),
    ).toBe(false);
    expect(isComposioAuthUrl("not-a-url")).toBe(false);
  });
});
