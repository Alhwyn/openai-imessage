export const COMPUTER_ACTION_SETTLE_MS = 300;
export const COMPUTER_COMPACTION_THRESHOLD = 60_000;
export const COMPUTER_DESKTOP_COMMAND_TIMEOUT_MS = 20_000;
export const COMPUTER_DESKTOP_SERVICE = "desktop";
export const COMPUTER_DISPLAY_POLL_MS = 500;
export const COMPUTER_DISPLAY_READY_TIMEOUT_MS = 45_000;
export const COMPUTER_DISPLAY_SIZE = { width: 1280, height: 800 } as const;
export const COMPUTER_MAXIMUM_STEPS = 30;
export const COMPUTER_MODEL = "openai/gpt-5.6-terra";
// Session recorder is paused during each still capture; one frame is enough.
export const COMPUTER_STABILITY_ATTEMPTS = 1;
export const COMPUTER_STABILITY_DELAY_MS = 150;
export const COMPUTER_VIEWER_HOST = "127.0.0.1";
export const COMPUTER_VIEWER_PORT = 6902;
export const COMPUTER_WATCHDOG_INTERVAL_MS = 60_000;
export const COMPUTER_WORKER_TIMEOUT_MS = 8 * 60_000;
