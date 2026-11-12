import { createHash } from "node:crypto";
import sharp from "sharp";
import { IMAGE_SIZE } from "../image";

export type ImageFormat = "png" | "jpeg" | "webp" | "gif";

/**
 * The format a file's first bytes declare, of the four an upload may be.
 * Anything else (SVG, HEIC, TIFF, AVIF…) is never handed to the decoder.
 */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  const at = (offset: number, ...values: number[]) => values.every((value, index) => bytes[offset + index] === value);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38) && (at(4, 0x37, 0x61) || at(4, 0x39, 0x61))) return "gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  return null;
}

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A small file can unpack to a huge image: past this many pixels it is refused before it is decoded in full. */
export const MAX_INPUT_PIXELS = 25_000_000;

/** The upload doesn't decode as the image it says it is. */
export class UnreadableImage extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "UnreadableImage";
  }
}

/**
 * An upload as it is stored: a 512 × 512 WebP, turned upright from its EXIF
 * orientation, centre-cropped to a square, with every piece of metadata
 * (EXIF, XMP, ICC, comments) left behind. An animated GIF or WebP keeps its
 * first frame. The hash is the stored file's own, so the same image always
 * gets the same address.
 */
export async function reencode(bytes: Uint8Array): Promise<{ webp: Buffer; hash: string }> {
  const format = sniffFormat(bytes);
  if (!format) throw new UnreadableImage("not a png, jpeg, webp or gif");
  let webp: Buffer;
  try {
    // One frame only (an animation's first), and never more pixels than MAX_INPUT_PIXELS.
    const image = sharp(bytes, { animated: false, limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await image.metadata();
    if (meta.format !== format) throw new UnreadableImage(`declares ${format}, decodes as ${meta.format}`);
    webp = await image.autoOrient().resize(IMAGE_SIZE, IMAGE_SIZE, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer();
  } catch (error) {
    throw error instanceof UnreadableImage ? error : new UnreadableImage("does not decode");
  }
  return { webp, hash: sha256(webp) };
}
