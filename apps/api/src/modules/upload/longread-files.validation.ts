import { BadRequestException } from '@nestjs/common';
import { MAX_ZIP_COMPRESSION_RATIO, MAX_ZIP_ENTRY_COUNT, MAX_ZIP_UNCOMPRESSED_BYTES, validateUploadFile, validateUploadMetadata } from './upload.validation.js';
import { inspectLongreadMedia } from './longread-media.validation.js';

export const LONGREAD_FILE_TYPES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/gif': ['gif'], 'image/webp': ['webp'],
  'audio/mpeg': ['mp3'], 'audio/wav': ['wav'], 'video/mp4': ['mp4'], 'video/webm': ['webm'],
  'application/pdf': ['pdf'], 'application/msword': ['doc'], 'application/vnd.ms-powerpoint': ['ppt'], 'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
};
export const isLongreadImage = (mimeType: string) => mimeType.startsWith('image/') && Object.hasOwn(LONGREAD_FILE_TYPES, mimeType);
export const isLongreadAudio = (mimeType: string) => ['audio/mpeg', 'audio/wav'].includes(mimeType);
export const isLongreadVideo = (mimeType: string) => ['video/mp4', 'video/webm'].includes(mimeType);
export const isLongreadAttachment = (mimeType: string) => Object.hasOwn(LONGREAD_FILE_TYPES, mimeType) && !isLongreadImage(mimeType) && !isLongreadAudio(mimeType) && !isLongreadVideo(mimeType);
export function validateLongreadFileMetadata(fileName: string, mimeType: string, sizeBytes: number) {
  validateUploadMetadata(fileName, mimeType, sizeBytes);
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  if (!extension || !LONGREAD_FILE_TYPES[mimeType]?.includes(extension) || /[\\/]/.test(fileName)) throw new BadRequestException('File extension does not match an allowed longread type');
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const normalizeFileId = (raw: unknown): string | null => typeof raw === 'string' && UUID.test(raw) ? raw.toLowerCase() : null;
export function collectFileIds(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectFileIds(item, found));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (key === 'fileId' && typeof item === 'string' && UUID.test(item)) found.add(item.toLowerCase()); else collectFileIds(item, found);
  }
  return found;
}

type RangeReader = (start: number, end: number) => Promise<Buffer>;
const fail = (): never => { throw new BadRequestException('File content does not match its declared type or is unsafe'); };
/** Shared post-scan validator for buffered and multipart uploads. Each range is at most 1 MiB. */
export async function validateLongreadObject(file: { fileName: string; mimeType: string; sizeBytes: number }, range: RangeReader) {
  validateLongreadFileMetadata(file.fileName, file.mimeType, file.sizeBytes);
  const head = await range(0, Math.min(file.sizeBytes, 8192) - 1);
  validateUploadFile({ originalname: file.fileName, mimetype: file.mimeType, size: file.sizeBytes, buffer: head } as Express.Multer.File);
  if (isLongreadAudio(file.mimeType) || isLongreadVideo(file.mimeType)) await inspectLongreadMedia(file.mimeType, file.sizeBytes, head, range);
  const extension = file.fileName.split('.').at(-1)!.toLowerCase();
  if (['docx', 'pptx', 'xlsx'].includes(extension)) await inspectZip(extension, file.sizeBytes, range);
  if (['doc', 'ppt', 'xls'].includes(extension)) await inspectCompound(extension, head, file.sizeBytes, range);
}
async function inspectZip(extension: string, size: number, range: RangeReader) {
  const start = Math.max(0, size - 65557), tail = await range(start, size - 1);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) { eocd = i; break; }
  if (eocd < 0) fail();
  const count = tail.readUInt16LE(eocd + 10), length = tail.readUInt32LE(eocd + 12), offset = tail.readUInt32LE(eocd + 16);
  if (!count || count > MAX_ZIP_ENTRY_COUNT || !length || length > 1024 * 1024 || offset + length > start + eocd || tail.readUInt32LE(eocd + 4) !== 0) fail();
  const central = await range(offset, offset + length - 1), names = new Set<string>();
  let position = 0, total = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > central.length || central.readUInt32LE(position) !== 0x02014b50) fail();
    const flags = central.readUInt16LE(position + 8), compressed = central.readUInt32LE(position + 20), expanded = central.readUInt32LE(position + 24);
    const n = central.readUInt16LE(position + 28), extra = central.readUInt16LE(position + 30), comment = central.readUInt16LE(position + 32);
    const next = position + 46 + n + extra + comment;
    if (next > central.length || flags & 1 || expanded === 0xffffffff || compressed === 0xffffffff || (expanded && (!compressed || expanded / compressed > MAX_ZIP_COMPRESSION_RATIO))) fail();
    total += expanded; if (total > MAX_ZIP_UNCOMPRESSED_BYTES) fail();
    const name = central.subarray(position + 46, position + 46 + n).toString('utf8');
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || names.has(name)) fail();
    names.add(name); position = next;
  }
  const required = { docx: 'word/document.xml', pptx: 'ppt/presentation.xml', xlsx: 'xl/workbook.xml' }[extension];
  if (position !== central.length || !names.has('[Content_Types].xml') || !required || !names.has(required)) fail();
}
async function inspectCompound(extension: string, head: Buffer, size: number, range: RangeReader) {
  if (head.length < 512 || head.readUInt16LE(28) !== 0xfffe || ![9, 12].includes(head.readUInt16LE(30))) fail();
  const sectorSize = 2 ** head.readUInt16LE(30), entries = sectorSize / 4;
  const sector = async (id: number) => {
    const offset = (id + 1) * sectorSize;
    if (id >= 0xfffffffa || offset + sectorSize > size) fail();
    return range(offset, offset + sectorSize - 1);
  };
  const fat: number[] = [];
  for (let i = 0; i < 109; i++) { const id = head.readUInt32LE(76 + i * 4); if (id < 0xfffffffa) fat.push(id); }
  let difat = head.readUInt32LE(68); const visitedDifat = new Set<number>();
  while (difat < 0xfffffffa) {
    if (visitedDifat.has(difat) || visitedDifat.size >= 32) fail(); visitedDifat.add(difat);
    const bytes = await sector(difat);
    for (let i = 0; i < entries - 1; i++) { const id = bytes.readUInt32LE(i * 4); if (id < 0xfffffffa) fat.push(id); }
    difat = bytes.readUInt32LE(sectorSize - 4);
  }
  const expected = { doc: ['WordDocument'], ppt: ['PowerPoint Document'], xls: ['Workbook', 'Book'] }[extension]!;
  let directory = head.readUInt32LE(48); const seen = new Set<number>();
  while (directory < 0xfffffffa) {
    if (seen.has(directory) || seen.size >= 128) fail(); seen.add(directory);
    const bytes = await sector(directory);
    for (let i = 0; i < sectorSize; i += 128) {
      const nameLength = bytes.readUInt16LE(i + 64);
      if (bytes[i + 66] === 2 && nameLength >= 2 && nameLength <= 64 && nameLength % 2 === 0 && expected.includes(bytes.subarray(i, i + nameLength - 2).toString('utf16le'))) return;
    }
    const tableId = fat[Math.floor(directory / entries)]; if (tableId === undefined) fail();
    const table = await sector(tableId); directory = table.readUInt32LE((directory % entries) * 4);
  }
  fail();
}
