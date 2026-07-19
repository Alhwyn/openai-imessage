import { afterEach, describe, expect, test } from "bun:test";

import {
  getComputerViewerBaseUrl,
  getKasmStreamUrl,
  resolveComputerPublicUrls,
} from "../urls";

const originalLiveViewUrl = process.env.COMPUTER_LIVE_VIEW_URL;

afterEach(() => {
  if (originalLiveViewUrl === undefined) delete process.env.COMPUTER_LIVE_VIEW_URL;
  else process.env.COMPUTER_LIVE_VIEW_URL = originalLiveViewUrl;
});

describe("public computer URLs", () => {
  test("returns no URLs without COMPUTER_LIVE_VIEW_URL", () => {
    delete process.env.COMPUTER_LIVE_VIEW_URL;
    expect(getKasmStreamUrl()).toBeUndefined();
    expect(getComputerViewerBaseUrl()).toBeUndefined();
  });

  test("uses COMPUTER_LIVE_VIEW_URL without reachability filtering", () => {
    process.env.COMPUTER_LIVE_VIEW_URL = "https://127.0.0.1:6901";
    expect(getKasmStreamUrl()).toBe("https://127.0.0.1:6901/?resize=scale");
    expect(getComputerViewerBaseUrl()).toBeUndefined();
  });

  test("resolves viewer page from desktop.* COMPUTER_LIVE_VIEW_URL", () => {
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
