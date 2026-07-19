import { describe, expect, test } from "bun:test";

import { isExternallyReachableHttpUrl } from "./desktop";
import { getComputerHostSafetyChecks } from "./safety";

describe("computer host safety", () => {
  test("requires approval for terminal input", () => {
    expect(
      getComputerHostSafetyChecks(
        { type: "type", text: "echo hello" },
        "xfce4-terminal",
      ),
    ).toEqual([
      {
        id: "host_terminal_input",
        message: "Typing into terminal windows requires explicit human approval",
      },
    ]);
  });

  test("requires approval for commit and system keypresses", () => {
    expect(
      getComputerHostSafetyChecks({ type: "keypress", keys: ["ENTER"] }),
    ).toHaveLength(1);
    expect(
      getComputerHostSafetyChecks({ type: "keypress", keys: ["CTRL", "L"] }),
    ).toHaveLength(1);
  });

  test("allows literal text and navigation keys", () => {
    expect(
      getComputerHostSafetyChecks({ type: "type", text: "--literal text" }),
    ).toEqual([]);
    expect(
      getComputerHostSafetyChecks({ type: "keypress", keys: ["ARROWDOWN"] }),
    ).toEqual([]);
  });
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
});
