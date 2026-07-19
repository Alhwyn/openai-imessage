import type { ComputerAction } from "./types";

export type ComputerHostSafetyCheck = {
  id: string;
  message: string;
};

const terminalWindowClasses = new Set([
  "alacritty",
  "gnome-terminal",
  "konsole",
  "kitty",
  "terminator",
  "xfce4-terminal",
  "xterm",
]);

const normalizedKeys = (keys: string[]): string[] =>
  keys.map((key) => key.trim().toUpperCase()).filter(Boolean);

/**
 * Host-enforced checks for gestures that can commit external side effects or
 * execute arbitrary commands. These do not depend on model safety metadata.
 */
export const getComputerHostSafetyChecks = (
  action: ComputerAction,
  activeWindowClass?: string,
): ComputerHostSafetyCheck[] => {
  if (
    (action.type === "type" || action.type === "keypress") &&
    activeWindowClass &&
    terminalWindowClasses.has(activeWindowClass.trim().toLowerCase())
  ) {
    return [
      {
        id: "host_terminal_input",
        message: "Typing into terminal windows requires explicit human approval",
      },
    ];
  }

  if (action.type === "type" && /[\u0000-\u0008\u000A-\u001F\u007F]/u.test(action.text)) {
    return [
      {
        id: "host_control_character_input",
        message: "Typing control characters requires explicit human approval",
      },
    ];
  }

  if (action.type !== "keypress") return [];

  const keys = normalizedKeys(action.keys);
  const commitsAction = keys.some((key) =>
    ["DELETE", "ENTER", "RETURN"].includes(key),
  );
  const usesSystemModifier = keys.some((key) =>
    ["ALT", "CTRL", "CONTROL", "META", "SUPER", "SUPER_L", "SUPER_R"].includes(
      key,
    ),
  );
  if (!commitsAction && !usesSystemModifier) return [];

  return [
    {
      id: "host_sensitive_keypress",
      message: `Keypress ${keys.join(" + ")} requires explicit human approval`,
    },
  ];
};
