import { BadRequestException } from '@nestjs/common';

import { MAX_UPLOAD_FILE_SIZE_BYTES, validateUploadFile } from './upload.validation';

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
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      size: 4,
    });

    expect(() => validateUploadFile(file)).not.toThrow();
  });
});
