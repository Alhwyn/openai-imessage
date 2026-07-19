const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;

/**
 * Fixed desktop geometry for screenshots, model coordinates, and the viewer overlay.
 */
export const getComputerDisplaySize = (): { width: number; height: number } => {
  const width = Number(process.env.COMPUTER_DISPLAY_WIDTH ?? DEFAULT_WIDTH);
  const height = Number(process.env.COMPUTER_DISPLAY_HEIGHT ?? DEFAULT_HEIGHT);

  if (!Number.isInteger(width) || width < 640) throw new Error("COMPUTER_DISPLAY_WIDTH must be an integer of at least 640");

  if (!Number.isInteger(height) || height < 480) throw new Error("COMPUTER_DISPLAY_HEIGHT must be an integer of at least 480");

  return { width, height };
};
