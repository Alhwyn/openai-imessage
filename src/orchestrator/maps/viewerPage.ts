import { join } from "node:path";

const htmlPath = join(import.meta.dir, "viewerPage.html");

export const mapsViewerHtml = await Bun.file(htmlPath).text();
