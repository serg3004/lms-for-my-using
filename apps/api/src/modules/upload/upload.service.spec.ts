import { ServiceUnavailableException } from '@nestjs/common';

import { UploadService } from './upload.service.js';

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(() => {
    delete process.env['S3_ENDPOINT'];
    delete process.env['S3_BUCKET'];
    delete process.env['S3_ACCESS_KEY_ID'];
    delete process.env['S3_SECRET_ACCESS_KEY'];
    service = new UploadService();
  });

  it('reports not configured when S3 env vars are absent', () => {
    expect(service.isConfigured()).toBe(false);
  });

  it('throws ServiceUnavailableException on uploadMaterialFile when not configured', async () => {
    const file = {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from(''),
      size: 0,
    } as Express.Multer.File;

    await expect(
      service.uploadMaterialFile(
        file,
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException on getPresignedUrl when not configured', async () => {
    await expect(service.getPresignedUrl('materials/test.pdf')).rejects.toThrow(ServiceUnavailableException);
  });

  it('reports configured when all S3 env vars are set', () => {
    process.env['S3_ENDPOINT'] = 'http://localhost:9000';
    process.env['S3_BUCKET'] = 'lms-bucket';
    process.env['S3_ACCESS_KEY_ID'] = 'minioadmin';
    process.env['S3_SECRET_ACCESS_KEY'] = 'minioadmin';

    const configured = new UploadService();
    expect(configured.isConfigured()).toBe(true);
  });

  it('creates a tenant-scoped opaque material key', () => {
    const key = service.createMaterialObjectKey(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    );
    expect(key).toMatch(
      /^organizations\/11111111-1111-1111-1111-111111111111\/materials\/22222222-2222-2222-2222-222222222222\/[0-9a-f-]{36}$/,
    );
    expect(key).not.toContain('test.pdf');
  });
});
