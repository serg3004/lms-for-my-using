import { mediaContainer } from '../../integration/longread-files.fixtures.js';
import { validateLongreadFileMetadata, validateLongreadObject } from './longread-files.validation.js';

describe('longread audio/video container inspection', () => {
  it.each([['mp3', 'audio/mpeg'], ['wav', 'audio/wav'], ['mp4', 'video/mp4'], ['webm', 'video/webm']] as const)('accepts %s and inspects bounded ranges', async (extension, mimeType) => {
    const bytes = mediaContainer(extension), ranges: number[] = [];
    await expect(validateLongreadObject({ fileName: `test.${extension}`, mimeType, sizeBytes: bytes.length }, async (a, b) => { ranges.push(b - a + 1); return bytes.subarray(a, b + 1); })).resolves.toBeUndefined();
    expect(Math.max(...ranges)).toBeLessThanOrEqual(1024 * 1024);
    expect(() => validateLongreadFileMetadata(`test.${extension}`, mimeType, 50 * 1024 * 1024)).not.toThrow();
    expect(() => validateLongreadFileMetadata(`test.${extension}`, mimeType, 50 * 1024 * 1024 + 1)).toThrow();
  });
  it.each([['mp3', 'audio/mpeg'], ['wav', 'audio/wav'], ['mp4', 'video/mp4'], ['webm', 'video/webm']] as const)('rejects forged %s headers and extension mismatch', async (extension, mimeType) => {
    const bytes = Buffer.alloc(64); if (extension === 'mp3') bytes.write('ID3'); if (extension === 'wav') { bytes.write('RIFF'); bytes.write('WAVE', 8); } if (extension === 'mp4') bytes.write('ftyp', 4); if (extension === 'webm') Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(bytes);
    await expect(validateLongreadObject({ fileName: `fake.${extension}`, mimeType, sizeBytes: bytes.length }, async (a, b) => bytes.subarray(a, b + 1))).rejects.toThrow();
    expect(() => validateLongreadFileMetadata('file.png', mimeType, 100)).toThrow();
  });
  it('rejects truncated WAV chunks, MPEG headers without subsequent frames and audio-only MP4', async () => {
    const wav = mediaContainer('wav'); wav.writeUInt32LE(100000, 40);
    const mp3 = mediaContainer('mp3'); mp3[417] = 0;
    const mp4 = mediaContainer('mp4'); mp4.write('soun', mp4.indexOf('vide'));
    for (const [bytes, fileName, mimeType] of [[wav, 'bad.wav', 'audio/wav'], [mp3, 'bad.mp3', 'audio/mpeg'], [mp4, 'bad.mp4', 'video/mp4']] as const) await expect(validateLongreadObject({ fileName, mimeType, sizeBytes: bytes.length }, async (a, b) => bytes.subarray(a, b + 1))).rejects.toThrow();
  });
});
