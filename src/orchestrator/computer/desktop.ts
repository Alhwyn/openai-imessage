import { dirname, resolve } from "node:path";

import type { ComputerAction } from "./types";

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;
const DEFAULT_SETTLE_MS = 300;

const keyAliases: Record<string, string> = {
  ALT: "alt",
  ARROWDOWN: "Down",
  ARROWLEFT: "Left",
  ARROWRIGHT: "Right",
  ARROWUP: "Up",
  BACKSPACE: "BackSpace",
  CTRL: "ctrl",
  DELETE: "Delete",
  ENTER: "Return",
  ESC: "Escape",
  ESCAPE: "Escape",
  META: "Super_L",
  SHIFT: "shift",
  SPACE: "space",
  TAB: "Tab",
};

const normalizeKey = (key: string): string => {
  const upper = key.trim().toUpperCase();
  return keyAliases[upper] ?? (key.length === 1 ? key.toLowerCase() : key);
};

const clampCoordinate = (value: number, maximum: number): number => {
  return Math.max(0, Math.min(Math.round(value), maximum - 1));
};

const buttonNumber = (
  button: "left" | "right" | "wheel" | "back" | "forward" | undefined,
): string => {
  switch (button) {
    case "right":
      return "3";
    case "wheel":
      return "2";
    case "back":
      return "8";
    case "forward":
      return "9";
    default:
      return "1";
  }
};

const getComposeFile = (): string => {
  return resolve(
    process.env.COMPUTER_COMPOSE_FILE?.trim() ||
      "runtime/computer/compose.yaml",
  );
};

const getDesktopService = (): string => {
  return process.env.COMPUTER_DESKTOP_SERVICE?.trim() || "desktop";
};

const getDisplaySize = (): { width: number; height: number } => {
  const width = Number(process.env.COMPUTER_DISPLAY_WIDTH ?? DEFAULT_WIDTH);
  const height = Number(process.env.COMPUTER_DISPLAY_HEIGHT ?? DEFAULT_HEIGHT);

  if (!Number.isInteger(width) || width < 640) {
    throw new Error("COMPUTER_DISPLAY_WIDTH must be an integer of at least 640");
  }
  if (!Number.isInteger(height) || height < 480) {
    throw new Error("COMPUTER_DISPLAY_HEIGHT must be an integer of at least 480");
  }

  return { width, height };
};

const runDocker = async (
  command: string[],
  options: { allowFailure?: boolean } = {},
): Promise<string> => {
  const child = Bun.spawn(
    [
      "docker",
      "compose",
      "-f",
      getComposeFile(),
      "exec",
      "-T",
      getDesktopService(),
      ...command,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(
      `Desktop command failed (${exitCode}): ${stderr.trim() || command.join(" ")}`,
    );
  }

  return stdout.trim();
};

const runXdotool = async (...args: string[]): Promise<void> => {
  await runDocker(["env", "DISPLAY=:1", "xdotool", ...args]);
};

const withModifiers = async (
  keys: string[] | undefined,
  execute: () => Promise<void>,
): Promise<void> => {
  const modifiers = (keys ?? []).map(normalizeKey);
  for (const key of modifiers) await runXdotool("keydown", key);
  try {
    await execute();
  } finally {
    for (const key of modifiers.reverse()) {
      await runXdotool("keyup", key).catch(() => undefined);
    }
  }
};

const movePointer = async (x: number, y: number): Promise<void> => {
  const { width, height } = getDisplaySize();
  await runXdotool(
    "mousemove",
    "--sync",
    String(clampCoordinate(x, width)),
    String(clampCoordinate(y, height)),
  );
};

export const getComputerLiveViewUrl = (): string => {
  return (
    process.env.COMPUTER_LIVE_VIEW_URL?.trim() ||
    `https://127.0.0.1:${process.env.COMPUTER_LIVE_VIEW_PORT?.trim() || "6901"}`
  );
};

export const assertDesktopReady = async (): Promise<void> => {
  await runDocker(["/opt/computer-agent/bin/screenshot", "/tmp/ready.png"]);
};

export const captureDesktopScreenshot = async (): Promise<Uint8Array> => {
  const path = `/tmp/computer-screen-${crypto.randomUUID()}.png`;
  try {
    await runDocker(["/opt/computer-agent/bin/screenshot", path]);
    const encoded = await runDocker(["base64", "-w", "0", path]);
    return new Uint8Array(Buffer.from(encoded, "base64"));
  } finally {
    await runDocker(["rm", "-f", path], { allowFailure: true });
  }
};

export const captureStableDesktopScreenshot = async (): Promise<Uint8Array> => {
  const attempts = Math.max(
    1,
    Math.min(6, Number(process.env.COMPUTER_STABILITY_ATTEMPTS ?? 3)),
  );
  const delayMs = Math.max(
    50,
    Math.min(2_000, Number(process.env.COMPUTER_STABILITY_DELAY_MS ?? 150)),
  );
  let previous = await captureDesktopScreenshot();

  for (let attempt = 1; attempt < attempts; attempt += 1) {
    await Bun.sleep(delayMs);
    const current = await captureDesktopScreenshot();
    if (Buffer.from(previous).equals(Buffer.from(current))) return current;
    previous = current;
  }

  return previous;
};

export const executeComputerAction = async (
  action: ComputerAction,
): Promise<void> => {
  switch (action.type) {
    case "click":
    case "double_click": {
      await withModifiers(action.keys, async () => {
        await movePointer(action.x, action.y);
        await runXdotool(
          "click",
          "--repeat",
          action.type === "double_click" ? "2" : "1",
          "--delay",
          "100",
          buttonNumber(action.button),
        );
      });
      break;
    }
    case "move": {
      await withModifiers(action.keys, () => movePointer(action.x, action.y));
      break;
    }
    case "type": {
      await runXdotool("type", "--clearmodifiers", "--delay", "1", action.text);
      break;
    }
    case "keypress": {
      const chord = action.keys.map(normalizeKey).join("+");
      if (chord) await runXdotool("key", "--clearmodifiers", chord);
      break;
    }
    case "scroll": {
      await withModifiers(action.keys, async () => {
        await movePointer(action.x, action.y);
        const vertical = action.scrollY ?? action.scroll_y ?? 0;
        const horizontal = action.scrollX ?? action.scroll_x ?? 0;
        const emitScroll = async (amount: number, negative: string, positive: string) => {
          if (amount === 0) return;
          const clicks = Math.max(1, Math.min(20, Math.ceil(Math.abs(amount) / 100)));
          await runXdotool(
            "click",
            "--repeat",
            String(clicks),
            "--delay",
            "30",
            amount < 0 ? negative : positive,
          );
        };
        await emitScroll(vertical, "4", "5");
        await emitScroll(horizontal, "6", "7");
      });
      break;
    }
    case "drag": {
      const [first, ...rest] = action.path;
      if (!first) break;
      await withModifiers(action.keys, async () => {
        await movePointer(first.x, first.y);
        await runXdotool("mousedown", "1");
        try {
          for (const point of rest) await movePointer(point.x, point.y);
        } finally {
          await runXdotool("mouseup", "1");
        }
      });
      break;
    }
    case "wait": {
      await Bun.sleep(1_000);
      break;
    }
    case "screenshot": {
      break;
    }
    default: {
      const exhaustive: never = action;
      throw new Error(`Unsupported computer action: ${JSON.stringify(exhaustive)}`);
    }
  }

  if (action.type !== "wait" && action.type !== "screenshot") {
    await Bun.sleep(
      Number(process.env.COMPUTER_ACTION_SETTLE_MS ?? DEFAULT_SETTLE_MS),
    );
  }
};

export const startDesktopRecording = async (runId: string): Promise<void> => {
  await runDocker(["/opt/computer-agent/bin/record-start", runId]);
};

export const stopDesktopRecording = async (
  runId: string,
): Promise<string | undefined> => {
  const output = await runDocker(
    ["/opt/computer-agent/bin/record-stop", runId],
    { allowFailure: true },
  );
  if (!output.endsWith("/demo.mp4")) return undefined;

  return resolve(dirname(getComposeFile()), "artifacts", runId, "demo.mp4");
};
