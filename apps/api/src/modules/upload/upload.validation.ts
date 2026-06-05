import { BadRequestException } from '@nestjs/common';

export const MAX_UPLOAD_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_ZIP_ENTRY_COUNT = 1000;
export const MAX_ZIP_COMPRESSION_RATIO = 100;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;

const MAX_FILENAME_BYTES = 255;

const PDF_MIME_TYPE = 'application/pdf';
const JPEG_MIME_TYPE = 'image/jpeg';
const PNG_MIME_TYPE = 'image/png';
const GIF_MIME_TYPE = 'image/gif';
const WEBP_MIME_TYPE = 'image/webp';
const MP4_MIME_TYPE = 'video/mp4';
const WEBM_MIME_TYPE = 'video/webm';
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const ZIP_BASED_MIME_TYPES = new Set([DOCX_MIME_TYPE, XLSX_MIME_TYPE]);

const ALLOWED_MIME_TYPES = new Set([
  PDF_MIME_TYPE,
  JPEG_MIME_TYPE,
  PNG_MIME_TYPE,
  GIF_MIME_TYPE,
  WEBP_MIME_TYPE,
  MP4_MIME_TYPE,
  WEBM_MIME_TYPE,
  DOCX_MIME_TYPE,
  XLSX_MIME_TYPE,
]);

export function validateUploadFile(file: Express.Multer.File): void {
  validateFileName(file.originalname);

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException(`File type "${file.mimetype}" is not allowed`);
  }

  if (file.size <= 0) {
    throw new BadRequestException('File is empty');
  }

  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    throw new BadRequestException('File exceeds maximum allowed size');
  }

  if (!matchesDeclaredMimeType(file.buffer, file.mimetype)) {
    throw new BadRequestException('File content does not match declared file type');
  }

  if (ZIP_BASED_MIME_TYPES.has(file.mimetype)) {
    checkZipArchiveSafety(file.buffer);
  }
}

export function validateFileName(originalname: string): void {
  if (!originalname || originalname.length === 0) {
    throw new BadRequestException('File name is missing');
  }

  if (Buffer.byteLength(originalname, 'utf8') > MAX_FILENAME_BYTES) {
    throw new BadRequestException('File name is too long');
  }

  if (originalname.includes('\0')) {
    throw new BadRequestException('File name contains invalid characters');
  }

  if (originalname.includes('..') || originalname.startsWith('/') || originalname.startsWith('\\')) {
    throw new BadRequestException('File name contains path traversal characters');
  }

  for (const char of originalname) {
    if (char.charCodeAt(0) < 0x20) {
      throw new BadRequestException('File name contains invalid characters');
    }
  }
}

function checkZipArchiveSafety(buffer: Buffer): void {
  let offset = 0;
  let totalUncompressed = 0;
  let entryCount = 0;

  while (offset + 30 <= buffer.length) {
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x03 ||
      buffer[offset + 3] !== 0x04
    ) {
      break;
    }

    entryCount++;
    if (entryCount > MAX_ZIP_ENTRY_COUNT) {
      throw new BadRequestException('Archive contains too many entries');
    }

    const flags = buffer.readUInt16LE(offset + 6);
    const hasDataDescriptor = (flags & 0x08) !== 0;
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    if (!hasDataDescriptor && compressedSize > 0 && uncompressedSize > 0) {
      if (uncompressedSize / compressedSize > MAX_ZIP_COMPRESSION_RATIO) {
        throw new BadRequestException('Archive compression ratio exceeds safe limit');
      }

      totalUncompressed += uncompressedSize;
      if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
        throw new BadRequestException('Archive uncompressed size exceeds safe limit');
      }
    }

    const nextOffset = offset + 30 + fileNameLength + extraLength + compressedSize;
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }
}

function matchesDeclaredMimeType(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === PDF_MIME_TYPE) {
    return startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46]);
  }

  if (mimeType === JPEG_MIME_TYPE) {
    return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  }

  if (mimeType === PNG_MIME_TYPE) {
    return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  if (mimeType === GIF_MIME_TYPE) {
    return buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a';
  }

  if (mimeType === WEBP_MIME_TYPE) {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  if (mimeType === MP4_MIME_TYPE) {
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }

  if (mimeType === WEBM_MIME_TYPE) {
    return startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  }

  if (ZIP_BASED_MIME_TYPES.has(mimeType)) {
    return startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]);
  }

  return false;
}

function startsWithBytes(buffer: Buffer, bytes: readonly number[]): boolean {
  if (buffer.length < bytes.length) {
    return false;
  }

  return bytes.every((byte, index) => buffer[index] === byte);
}
