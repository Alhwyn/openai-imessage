import { afterEach, describe, expect, test } from "bun:test";

import { getMapsViewerBaseUrl, getMapsViewerPageUrl } from "../urls";

const originalBase = process.env.MAPS_PUBLIC_BASE_URL;

afterEach(() => {
  if (originalBase === undefined) delete process.env.MAPS_PUBLIC_BASE_URL;
  else process.env.MAPS_PUBLIC_BASE_URL = originalBase;
});

describe("maps viewer urls", () => {
  test("returns undefined without MAPS_PUBLIC_BASE_URL", () => {
    delete process.env.MAPS_PUBLIC_BASE_URL;
    expect(getMapsViewerBaseUrl()).toBeUndefined();
    expect(getMapsViewerPageUrl("id", "token")).toBeUndefined();
  });

  test("builds tokenized page URL from origin", () => {
    process.env.MAPS_PUBLIC_BASE_URL = "https://maps.alhwyn.com/";
    expect(getMapsViewerBaseUrl()).toBe("https://maps.alhwyn.com");
    expect(getMapsViewerPageUrl("abc", "tok")).toBe(
      "https://maps.alhwyn.com/maps/abc?token=tok",
    );
  });
});
