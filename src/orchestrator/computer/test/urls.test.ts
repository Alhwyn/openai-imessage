import { afterEach, describe, expect, test } from "bun:test";

import {
  deriveComputerPublicHostUrl,
  getComputerViewerBaseUrl,
  getKasmStreamUrl,
  isExternallyReachableHttpUrl,
  resolveComputerPublicUrls,
} from "./urls";

const originalEnv = {
  BASE_URL: process.env.BASE_URL,
  COMPUTER_LIVE_VIEW_URL: process.env.COMPUTER_LIVE_VIEW_URL,
  COMPUTER_VIEWER_URL: process.env.COMPUTER_VIEWER_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("public computer URLs", () => {
  test("accepts externally reachable HTTP URLs", () => {
    expect(isExternallyReachableHttpUrl("https://viewer.example.com")).toBe(
      true,
    );
  });

  test("rejects local and private URLs", () => {
    expect(isExternallyReachableHttpUrl("https://127.0.0.1:6901")).toBe(false);
    expect(isExternallyReachableHttpUrl("http://localhost:6902")).toBe(false);
    expect(isExternallyReachableHttpUrl("http://192.168.1.5")).toBe(false);
  });

  test("derives desktop and viewer hosts from BASE_URL", () => {
    delete process.env.COMPUTER_LIVE_VIEW_URL;
    delete process.env.COMPUTER_VIEWER_URL;
    process.env.BASE_URL = "https://agent.alhwyn.com";

    expect(deriveComputerPublicHostUrl("desktop")).toBe(
      "https://desktop.alhwyn.com",
    );
    expect(deriveComputerPublicHostUrl("viewer")).toBe(
      "https://viewer.alhwyn.com",
    );
    expect(getKasmStreamUrl()).toBe("https://desktop.alhwyn.com/?resize=scale");
    expect(getComputerViewerBaseUrl()).toBe("https://viewer.alhwyn.com");
  });

  test("falls back to BASE_URL when COMPUTER_LIVE_VIEW_URL is local-only", () => {
    process.env.BASE_URL = "https://agent.alhwyn.com";
    process.env.COMPUTER_LIVE_VIEW_URL = "https://127.0.0.1:6901";
    delete process.env.COMPUTER_VIEWER_URL;

    expect(getKasmStreamUrl()).toBe("https://desktop.alhwyn.com/?resize=scale");
    expect(getComputerViewerBaseUrl()).toBe("https://viewer.alhwyn.com");
  });

  test("resolves viewer page from desktop.* COMPUTER_LIVE_VIEW_URL", () => {
    delete process.env.BASE_URL;
    delete process.env.COMPUTER_VIEWER_URL;
    process.env.COMPUTER_LIVE_VIEW_URL = "https://desktop.alhwyn.com";

    expect(getKasmStreamUrl()).toBe("https://desktop.alhwyn.com/?resize=scale");
    expect(getComputerViewerBaseUrl()).toBe("https://viewer.alhwyn.com");

    const urls = resolveComputerPublicUrls("computer_1", "token");
    expect(urls.kasmStreamUrl).toBe("https://desktop.alhwyn.com/?resize=scale");
    expect(urls.viewerPageUrl).toBe(
      "https://viewer.alhwyn.com/computer/computer_1?token=token",
    );
  });
});
