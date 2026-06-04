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

  it('throws ServiceUnavailableException on uploadFile when not configured', async () => {
    const file = {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from(''),
      size: 0,
    } as Express.Multer.File;

    await expect(service.uploadFile(file)).rejects.toThrow(ServiceUnavailableException);
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
});
