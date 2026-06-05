import { BadRequestException } from '@nestjs/common';

import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_ZIP_COMPRESSION_RATIO,
  MAX_ZIP_ENTRY_COUNT,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  validateFileName,
  validateUploadFile,
} from './upload.validation';

function createFile(overrides: Partial<Express.Multer.File>): Express.Multer.File {
  const buffer = overrides.buffer ?? Buffer.from('%PDF-1.7');

  return {
    fieldname: 'file',
    originalname: 'test.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    buffer,
    size: buffer.length,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function buildZipEntry(opts: { compressedSize: number; uncompressedSize: number; flags?: number }): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(opts.flags ?? 0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(opts.compressedSize, 18);
  header.writeUInt32LE(opts.uncompressedSize, 22);
  header.writeUInt16LE(0, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, Buffer.alloc(opts.compressedSize)]);
}

function buildZipBuffer(entries: Array<{ compressedSize: number; uncompressedSize: number; flags?: number }>): Buffer {
  return Buffer.concat(entries.map(buildZipEntry));
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('validateUploadFile', () => {
  it('accepts a PDF when declared MIME type matches magic bytes', () => {
    expect(() => validateUploadFile(createFile({}))).not.toThrow();
  });

  it('rejects unsupported declared MIME types', () => {
    const file = createFile({
      mimetype: 'text/html',
      buffer: Buffer.from('<html></html>'),
    });

    expect(() => validateUploadFile(file)).toThrow(BadRequestException);
  });

  it('rejects files whose content does not match declared MIME type', () => {
    const file = createFile({
      mimetype: 'application/pdf',
      buffer: Buffer.from('not a pdf'),
    });

    expect(() => validateUploadFile(file)).toThrow(BadRequestException);
  });

  it('rejects files over the MVP upload size limit', () => {
    const file = createFile({
      size: MAX_UPLOAD_FILE_SIZE_BYTES + 1,
    });

    expect(() => validateUploadFile(file)).toThrow(BadRequestException);
  });

  it('accepts DOCX files only when they have a ZIP container signature', () => {
    const file = createFile({
      mimetype: DOCX,
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      size: 4,
    });

    expect(() => validateUploadFile(file)).not.toThrow();
  });
});

describe('validateFileName', () => {
  it('accepts a normal file name', () => {
    expect(() => validateFileName('document.pdf')).not.toThrow();
  });

  it('rejects an empty file name', () => {
    expect(() => validateFileName('')).toThrow(BadRequestException);
  });

  it('rejects a file name containing a null byte', () => {
    expect(() => validateFileName('file\0.pdf')).toThrow(BadRequestException);
  });

  it('rejects a file name with path traversal using ..', () => {
    expect(() => validateFileName('../secret.pdf')).toThrow(BadRequestException);
  });

  it('rejects a file name starting with /', () => {
    expect(() => validateFileName('/etc/passwd')).toThrow(BadRequestException);
  });

  it('rejects a file name starting with \\', () => {
    expect(() => validateFileName('\\windows\\system32')).toThrow(BadRequestException);
  });

  it('rejects a file name containing a control character', () => {
    expect(() => validateFileName('file\x01name.pdf')).toThrow(BadRequestException);
  });

  it('rejects a file name exceeding 255 bytes', () => {
    expect(() => validateFileName('a'.repeat(256))).toThrow(BadRequestException);
  });
});

describe('ZIP archive bomb detection', () => {
  it('accepts a DOCX with a normal ZIP structure', () => {
    const buffer = buildZipBuffer([{ compressedSize: 100, uncompressedSize: 200 }]);
    const file = createFile({ mimetype: DOCX, buffer, size: buffer.length });

    expect(() => validateUploadFile(file)).not.toThrow();
  });

  it(`rejects a ZIP with more than ${MAX_ZIP_ENTRY_COUNT} entries`, () => {
    const entries = Array.from({ length: MAX_ZIP_ENTRY_COUNT + 1 }, () => ({
      compressedSize: 1,
      uncompressedSize: 1,
    }));
    const buffer = buildZipBuffer(entries);
    const file = createFile({ mimetype: DOCX, buffer, size: buffer.length });

    expect(() => validateUploadFile(file)).toThrow(BadRequestException);
  });

  it(`rejects a ZIP entry with compression ratio above ${MAX_ZIP_COMPRESSION_RATIO}:1`, () => {
    const compressedSize = 100;
    const uncompressedSize = compressedSize * (MAX_ZIP_COMPRESSION_RATIO + 1);
    const buffer = buildZipBuffer([{ compressedSize, uncompressedSize }]);
    const file = createFile({ mimetype: DOCX, buffer, size: buffer.length });

    expect(() => validateUploadFile(file)).toThrow(BadRequestException);
  });

  it(`rejects a ZIP whose total uncompressed size exceeds ${MAX_ZIP_UNCOMPRESSED_BYTES} bytes`, () => {
    // single entry: compressedSize large enough that ratio <= MAX, but uncompressed > limit
    const compressedSize = Math.ceil(MAX_ZIP_UNCOMPRESSED_BYTES / MAX_ZIP_COMPRESSION_RATIO) + 1;
    const uncompressedSize = MAX_ZIP_UNCOMPRESSED_BYTES + 1;
    const buffer = buildZipBuffer([{ compressedSize, uncompressedSize }]);
    const file = createFile({ mimetype: DOCX, buffer, size: buffer.length });

    expect(() => validateUploadFile(file)).toThrow(BadRequestException);
  });

  it('skips size checks for ZIP entries with a data descriptor flag', () => {
    // flags bit 3 set = data descriptor; scanner should skip size checks for these
    const buffer = buildZipBuffer([{ compressedSize: 1, uncompressedSize: 0, flags: 0x08 }]);
    const file = createFile({ mimetype: DOCX, buffer, size: buffer.length });

    expect(() => validateUploadFile(file)).not.toThrow();
  });
});
