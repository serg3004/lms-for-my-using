import { BadRequestException } from '@nestjs/common';

export const MAX_UPLOAD_FILE_SIZE_BYTES = 50 * 1024 * 1024;

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
