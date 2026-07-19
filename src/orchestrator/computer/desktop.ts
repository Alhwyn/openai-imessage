import { dirname, resolve } from "node:path";

import {
  COMPUTER_ACTION_SETTLE_MS,
  COMPUTER_DESKTOP_COMMAND_TIMEOUT_MS,
  COMPUTER_DESKTOP_SERVICE,
  COMPUTER_DISPLAY_SIZE,
  COMPUTER_STABILITY_ATTEMPTS,
  COMPUTER_STABILITY_DELAY_MS,
} from "./constants";

import type { ComputerAction } from "./types";

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

const COMPOSE_FILE = resolve("runtime/computer/compose.yaml");
const COMPOSE_PROJECT =
  dirname(COMPOSE_FILE).split("/").pop() ||
  "computer";

const runProcess = async (
  argv: string[],
  options: { allowFailure?: boolean; timeoutMs?: number } = {},
): Promise<string> => {
  const timeoutMs = options.timeoutMs ?? COMPUTER_DESKTOP_COMMAND_TIMEOUT_MS;
  const child = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    if (timedOut) throw new Error(
      `Desktop command timed out after ${timeoutMs}ms: ${argv.join(" ")}`,
    );

    if (exitCode !== 0 && !options.allowFailure) throw new Error(
      `Desktop command failed (${exitCode}): ${stderr.trim() || argv.join(" ")}`,
    );

    return stdout.trim();
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Resolves the running desktop container without re-parsing compose env
 * interpolation (which requires COMPUTER_DESKTOP_PASSWORD on every call).
 */
const getDesktopContainerId = async (): Promise<string> => {
  const byLabel = await runProcess(
    [
      "docker",
      "ps",
      "-q",
      "--filter",
      `label=com.docker.compose.project=${COMPOSE_PROJECT}`,
      "--filter",
      `label=com.docker.compose.service=${COMPUTER_DESKTOP_SERVICE}`,
    ],
    { allowFailure: true },
  );
  const containerId = byLabel.split("\n").map((line) => line.trim()).find(Boolean);
  if (containerId) return containerId;

  const hasPassword = Boolean(process.env.COMPUTER_DESKTOP_PASSWORD?.trim());
  throw new Error(
    "Desktop container is not running. " +
      (hasPassword
        ? "Run `bun run computer:up` and wait until https://127.0.0.1:6901 is reachable."
        : "Add COMPUTER_DESKTOP_PASSWORD to your local .env, then run `bun run computer:up`."),
  );
};

const runDocker = async (
  command: string[],
  options: { allowFailure?: boolean; timeoutMs?: number } = {},
): Promise<string> => {
  const containerId = await getDesktopContainerId();
  // Note: `docker exec` has no `-T` flag (that is compose-only). Omit TTY allocation.
  return runProcess(["docker", "exec", containerId, ...command], options);
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
    for (const key of modifiers.reverse()) await runXdotool("keyup", key).catch(() => undefined);

  }
};

const movePointer = async (x: number, y: number): Promise<void> => {
  const { width, height } = COMPUTER_DISPLAY_SIZE;
  await runXdotool(
    "mousemove",
    "--sync",
    String(clampCoordinate(x, width)),
    String(clampCoordinate(y, height)),
  );
};

/**
 * Forces the X11 desktop back to the configured size so model coordinates stay valid.
 * VNC clients otherwise resize the session (seen as 2632x1662 vs expected 1280x800).
 */
export const ensureFixedDisplaySize = async (): Promise<{
  width: number;
  height: number;
  before?: string;
  after?: string;
}> => {
  const { width, height } = COMPUTER_DISPLAY_SIZE;
  const readDims =
    "timeout 3 xdpyinfo -display :1 2>/dev/null | awk '/dimensions:/ {print $2; found=1} END { if (!found) exit 0 }' || true";
  const before = await runDocker(["bash", "-lc", readDims], {
    allowFailure: true,
    timeoutMs: 8_000,
  });
  if (before === `${width}x${height}`) return { width, height, before, after: before };

  await runDocker(
    [
      "bash",
      "-lc",
      `timeout 5 env DISPLAY=:1 xrandr --output VNC-0 --mode ${width}x${height} 2>/dev/null || timeout 5 env DISPLAY=:1 xrandr -s ${width}x${height} || true`,
    ],
    { allowFailure: true, timeoutMs: 10_000 },
  );
  const after = await runDocker(["bash", "-lc", readDims], {
    allowFailure: true,
    timeoutMs: 8_000,
  });
  return { width, height, before: before || undefined, after: after || undefined };
};

export const assertDesktopReady = async (): Promise<void> => {
  await ensureFixedDisplaySize();
  await runDocker(["/opt/computer-agent/bin/screenshot", "/tmp/ready.png"], {
    timeoutMs: 15_000,
  });
};

/**
 * Always launch Google Chrome at task start so the agent never has to hunt
 * for the dock icon or fall back to another browser.
 */
export const openGoogleChrome = async (): Promise<void> => {
  await runDocker(
    [
      "bash",
      "-lc",
      `
        export DISPLAY=:1
        if pgrep -x chrome >/dev/null 2>&1 || pgrep -x google-chrome >/dev/null 2>&1; then
          exit 0
        fi
        (google-chrome --no-first-run --no-default-browser-check --disable-session-crashed-bubble about:blank >/tmp/chrome-launch.log 2>&1 &) || \
        (google-chrome-stable --no-first-run --no-default-browser-check --disable-session-crashed-bubble about:blank >/tmp/chrome-launch.log 2>&1 &) || \
        (chromium --no-first-run --no-default-browser-check about:blank >/tmp/chrome-launch.log 2>&1 &) || true
        for _ in $(seq 1 20); do
          if pgrep -x chrome >/dev/null 2>&1 || pgrep -x google-chrome >/dev/null 2>&1 || pgrep -x chromium >/dev/null 2>&1; then
            exit 0
          fi
          sleep 0.25
        done
        exit 0
      `,
    ],
    { allowFailure: true, timeoutMs: 15_000 },
  );
};

/**
 * Starts each computer task with a clean browser state while preserving Chrome's
 * installed profile preferences so first-run prompts do not reappear.
 */
export const resetDesktopBrowserSession = async (): Promise<void> => {
  await runDocker(
    [
      "bash",
      "-lc",
      `
        pkill -x chrome 2>/dev/null || true
        pkill -x google-chrome 2>/dev/null || true
        pkill -x chromium 2>/dev/null || true
        sleep 1
        for profile in "$HOME/.config/google-chrome/Default" "$HOME/.config/chromium/Default"; do
          rm -rf \
            "$profile/Cache" \
            "$profile/Code Cache" \
            "$profile/GPUCache" \
            "$profile/IndexedDB" \
            "$profile/Local Storage" \
            "$profile/Session Storage" \
            "$profile/Sessions" \
            "$profile/Service Worker" \
            "$profile/WebStorage"
          rm -f \
            "$profile/Cookies" \
            "$profile/Cookies-journal" \
            "$profile/History" \
            "$profile/History-journal" \
            "$profile/Network/Cookies" \
            "$profile/Network/Cookies-journal"
        done
        rm -rf "$HOME/.cache/google-chrome" "$HOME/.cache/chromium"
        rm -f "$HOME/.config/google-chrome/Singleton"* "$HOME/.config/chromium/Singleton"*
      `,
    ],
    { timeoutMs: 15_000 },
  );
};

/**
 * Removes user-created files shared by the long-lived desktop container.
 * Browser profile preferences remain, while cookies and site storage are reset
 * separately by resetDesktopBrowserSession.
 */
export const resetDesktopWorkspace = async (): Promise<void> => {
  await runDocker(
    [
      "bash",
      "-lc",
      `
        for directory in /workspace "$HOME/Downloads" "$HOME/Desktop" "$HOME/Documents"; do
          mkdir -p "$directory"
          find "$directory" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
        done
      `,
    ],
    { timeoutMs: 15_000 },
  );
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
  let previous = await captureDesktopScreenshot();

  for (
    let attempt = 1;
    attempt < COMPUTER_STABILITY_ATTEMPTS;
    attempt += 1
  ) {
    await Bun.sleep(COMPUTER_STABILITY_DELAY_MS);
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
      await runXdotool(
        "type",
        "--clearmodifiers",
        "--delay",
        "1",
        "--",
        action.text,
      );
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

  if (action.type !== "wait" && action.type !== "screenshot") await Bun.sleep(
    COMPUTER_ACTION_SETTLE_MS,
  );

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

  return resolve(dirname(COMPOSE_FILE), "artifacts", runId, "demo.mp4");
};
