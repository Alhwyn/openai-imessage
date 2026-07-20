import { describe, expect, test } from "bun:test";

import { createDirectionsLink } from "../maps";

describe("createDirectionsLink", () => {
  test("builds a navigate URL with destination and no origin", () => {
    const result = createDirectionsLink({
      destination: "Beacon Hill Park",
      searchArea: "Victoria, BC",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe(
      "Beacon Hill Park, Victoria, BC",
    );
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(url.searchParams.has("origin")).toBe(false);
    expect(result.destination).toBe("Beacon Hill Park");
    expect(result.searchArea).toBe("Victoria, BC");
  });

  test("URL-encodes special characters in destination", () => {
    const result = createDirectionsLink({
      destination: "City Hall, New York",
      searchArea: "NY",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.url).toContain("destination=City+Hall%2C+New+York%2C+NY");
    expect(result.url).not.toContain("origin=");
  });

  test("rejects empty destination or searchArea", () => {
    expect(
      createDirectionsLink({ destination: "  ", searchArea: "Victoria, BC" }),
    ).toEqual({
      status: "failed",
      error: "destination and searchArea are required",
    });
    expect(
      createDirectionsLink({ destination: "Beacon Hill Park", searchArea: "" }),
    ).toEqual({
      status: "failed",
      error: "destination and searchArea are required",
    });
  });
});
