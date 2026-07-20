import sharp from "sharp";

/**
 * Converts arbitrary image bytes to JPEG for Photon chat backgrounds.
 */
export const toBackgroundJpeg = async (data: Uint8Array): Promise<Uint8Array> => {
  if (data.byteLength === 0) throw new Error("Background image was empty");

  const jpeg = new Uint8Array(
    await sharp(data).jpeg({ quality: 85 }).toBuffer(),
  );
  if (jpeg.byteLength === 0) throw new Error("Background image was empty after conversion");

  return jpeg;
};
