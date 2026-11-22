import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/** The picture is kept at most this many pixels on the long side; the list thumbnail is a square of THUMB_SIZE. */
export const PHOTO_MAX_SIDE = 1024;
export const THUMB_SIZE = 128;
/** A photo larger than this many pixels is refused before it is decoded (guards against decompression bombs). */
const MAX_INPUT_PIXELS = 24_000_000;

export type ProcessedPhoto = { full: Buffer; thumb: Buffer; mimeType: 'image/webp' };

/**
 * PR 496: decodes the upload, turns it upright, cuts it down and re-encodes it as WebP. Re-encoding drops everything that is
 * not pixels (EXIF with location and camera data, embedded files); a file that only looks like an image fails here.
 */
export async function processProfilePhoto(input: Buffer): Promise<ProcessedPhoto> {
  try {
    const base = () => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).rotate();
    const [full, thumb] = await Promise.all([
      base().resize({ width: PHOTO_MAX_SIDE, height: PHOTO_MAX_SIDE, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      base().resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'cover' }).webp({ quality: 80 }).toBuffer(),
    ]);
    return { full, thumb, mimeType: 'image/webp' };
  } catch {
    throw new BadRequestException('The file is not a readable image');
  }
}
