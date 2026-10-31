import { BadRequestException } from '@nestjs/common';

type RangeReader = (start: number, end: number) => Promise<Buffer>;
const invalid = (): never => { throw new BadRequestException('Invalid or unsupported media container'); };
function mp3FrameLength(bytes: Buffer, at: number): number {
  if (at + 4 > bytes.length || bytes[at] !== 255 || (bytes[at + 1]! & 0xe0) !== 0xe0) return 0;
  const version = (bytes[at + 1]! >> 3) & 3, layer = (bytes[at + 1]! >> 1) & 3;
  const bitrate = (bytes[at + 2]! >> 4) & 15, rate = (bytes[at + 2]! >> 2) & 3;
  if (version === 1 || layer !== 1 || !bitrate || bitrate === 15 || rate === 3) return 0;
  const kbps = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrate]!;
  const sampleRate = [44100, 48000, 32000][rate]! / (version === 3 ? 1 : version === 2 ? 2 : 4);
  return Math.floor((version === 3 ? 144000 : 72000) * kbps / sampleRate) + ((bytes[at + 2]! >> 1) & 1);
}

/** Container checks only, never a codec/transcoding promise. Reads are bounded even for multipart objects. */
export async function inspectLongreadMedia(type: string, size: number, head: Buffer, range: RangeReader) {
  if (type === 'audio/mpeg') {
    let offset = 0;
    if (head.subarray(0, 3).toString('ascii') === 'ID3') {
      if (head.length < 10 || ![2, 3, 4].includes(head[3]!) || head.subarray(6, 10).some((byte) => byte > 127)) invalid();
      offset = 10 + head[6]! * 2 ** 21 + head[7]! * 2 ** 14 + head[8]! * 128 + head[9]! + (head[3] === 4 && (head[5]! & 16) ? 10 : 0);
    }
    if (offset + 8 > size) invalid();
    const frames = offset ? await range(offset, Math.min(size - 1, offset + 8191)) : head;
    for (let i = 0; i < Math.min(4096, frames.length - 4); i++) {
      const length = mp3FrameLength(frames, i);
      if (length && mp3FrameLength(frames, i + length)) return;
    }
    invalid();
  }
  if (type === 'audio/wav') {
    if (head.length < 44 || head.readUInt32LE(4) + 8 !== size) invalid();
    let offset = 12, format = false;
    for (let count = 0; offset + 8 <= size && count < 128; count++) {
      const chunk = await range(offset, Math.min(offset + 47, size - 1));
      const name = chunk.subarray(0, 4).toString('ascii'), length = chunk.readUInt32LE(4);
      if (offset + 8 + length > size) invalid();
      if (name === 'fmt ') {
        if (length < 16 || chunk.length < 24 || ![1, 3].includes(chunk.readUInt16LE(8)) || !chunk.readUInt16LE(10) || !chunk.readUInt32LE(12) || !chunk.readUInt16LE(20) || !chunk.readUInt16LE(22)) invalid();
        format = true;
      }
      if (name === 'data') { if (!format || !length) invalid(); return; }
      offset += 8 + length + (length % 2);
    }
    invalid();
  }
  if (type === 'video/webm' && !head.includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]))) invalid();
  if (type === 'video/mp4') {
    if (head.length < 16 || head.readUInt32BE(0) < 16 || head.readUInt32BE(0) > 1024 || head.subarray(8, 12).toString('ascii') === 'qt  ') invalid();
    let offset = 0, movie = false, data = false;
    for (let count = 0; offset + 8 <= size && count < 128; count++) {
      const box = await range(offset, Math.min(offset + 15, size - 1));
      const name = box.subarray(4, 8).toString('ascii'); let length = box.readUInt32BE(0), header = 8;
      if (length === 1) { if (box.length < 16) invalid(); const wide = box.readBigUInt64BE(8); if (wide > BigInt(size)) invalid(); length = Number(wide); header = 16; }
      if (length === 0) length = size - offset;
      if (length < header || offset + length > size) invalid();
      if (name === 'moov') {
        if (length > 1024 * 1024) invalid();
        const bytes = await range(offset, offset + length - 1);
        function videoTrack(start: number, end: number, depth = 0): boolean {
          if (depth > 4) return false;
          for (let i = start; i + 8 <= end;) {
            const n = bytes.readUInt32BE(i), kind = bytes.subarray(i + 4, i + 8).toString('ascii');
            if (n < 8 || i + n > end) return false;
            if (kind === 'hdlr' && n >= 20 && bytes.subarray(i + 16, i + 20).toString('ascii') === 'vide') return true;
            if (['trak', 'mdia'].includes(kind) && videoTrack(i + 8, i + n, depth + 1)) return true;
            i += n;
          }
          return false;
        }
        movie = videoTrack(header, bytes.length);
      }
      if (name === 'mdat' && length > header) data = true;
      offset += length;
    }
    if (!movie || !data || offset !== size) invalid();
  }
}
