import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';

import { PHOTO_MAX_SIDE, THUMB_SIZE, processProfilePhoto } from './profile-photo.js';

async function image(width: number, height: number, format: 'png' | 'jpeg' = 'png') {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })[format]().toBuffer();
}

describe('processProfilePhoto (PR 496)', () => {
  it('cuts a large picture down and makes a square thumbnail, both WebP', async () => {
    const result = await processProfilePhoto(await image(3000, 2000));
    const full = await sharp(result.full).metadata();
    const thumb = await sharp(result.thumb).metadata();
    expect([full.format, full.width, full.height]).toEqual(['webp', PHOTO_MAX_SIDE, Math.round((PHOTO_MAX_SIDE * 2) / 3)]);
    expect([thumb.format, thumb.width, thumb.height]).toEqual(['webp', THUMB_SIZE, THUMB_SIZE]);
    expect(result.mimeType).toBe('image/webp');
  });

  it('does not enlarge a small picture', async () => {
    const result = await processProfilePhoto(await image(200, 100, 'jpeg'));
    expect(await sharp(result.full).metadata()).toMatchObject({ width: 200, height: 100 });
  });

  it('drops EXIF data such as the location', async () => {
    const withExif = await sharp(await image(50, 50)).withExif({ IFD0: { Copyright: 'secret-owner' } }).jpeg().toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const result = await processProfilePhoto(withExif);
    expect((await sharp(result.full).metadata()).exif).toBeUndefined();
    expect(result.full.toString('latin1')).not.toContain('secret-owner');
  });

  it('refuses bytes that only start like an image', async () => {
    const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('not really a picture')]);
    await expect(processProfilePhoto(fake)).rejects.toThrow(BadRequestException);
  });
});
