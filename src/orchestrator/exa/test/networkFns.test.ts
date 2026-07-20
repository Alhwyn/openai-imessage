import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  clearExaClient,
  searchNearbyPlaces,
  setExaSearchForTests,
} from "../networkFns";

const originalApiKey = process.env.EXA_API_KEY;

afterEach(() => {
  clearExaClient();
  mock.restore();
  if (originalApiKey === undefined) delete process.env.EXA_API_KEY;
  else process.env.EXA_API_KEY = originalApiKey;
});

describe("searchNearbyPlaces", () => {
  test("returns disabled when EXA_API_KEY is missing", async () => {
    delete process.env.EXA_API_KEY;
    const result = await searchNearbyPlaces({
      subject: "peacocks",
      searchArea: "Victoria, BC",
    });
    expect(result).toEqual({
      status: "disabled",
      error: "EXA_API_KEY is not configured",
    });
  });

  test("runs one query and drops incomplete or duplicate urls", async () => {
    process.env.EXA_API_KEY = "test-key";
    const search = mock(() =>
      Promise.resolve({
        results: [
          {
            title: "Beacon Hill peacocks",
            url: "https://example.com/beacon",
            highlights: ["peacocks live in Beacon Hill Park"],
          },
          {
            title: "dup",
            url: "https://example.com/beacon",
            highlights: ["same"],
          },
          {
            title: "Missing url",
            url: "",
            highlights: ["drop"],
          },
          {
            title: "Another park",
            url: "https://example.com/other",
            highlights: ["also peacocks"],
          },
        ],
      }),
    );
    setExaSearchForTests(search);

    const result = await searchNearbyPlaces({
      subject: "parks with peacocks",
      searchArea: "Victoria, BC",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.query).toBe(
      "where to find parks with peacocks near Victoria, BC",
    );
    expect(result.results.map((item) => item.url)).toEqual([
      "https://example.com/beacon",
      "https://example.com/other",
    ]);
    expect(search).toHaveBeenCalledTimes(1);
  });

  test("returns failed when Exa throws", async () => {
    process.env.EXA_API_KEY = "test-key";
    setExaSearchForTests(() => Promise.reject(new Error("rate limited")));

    const result = await searchNearbyPlaces({
      subject: "peacocks",
      searchArea: "Victoria, BC",
    });

    expect(result).toEqual({
      status: "failed",
      error: "rate limited",
    });
  });

  test("rejects empty subject or searchArea", async () => {
    process.env.EXA_API_KEY = "test-key";
    const result = await searchNearbyPlaces({
      subject: "  ",
      searchArea: "Victoria, BC",
    });
    expect(result.status).toBe("failed");
  });
});
