import { ServiceUnavailableException } from '@nestjs/common';

import { UploadService } from './upload.service.js';

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(() => {
    delete process.env['S3_ENDPOINT'];
    delete process.env['S3_BUCKET'];
    delete process.env['S3_ACCESS_KEY_ID'];
    delete process.env['S3_SECRET_ACCESS_KEY'];
    delete process.env['S3_FILE_ORIGIN'];
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
    await expect(service.getPresignedUrl('materials/test.pdf', 'test.pdf', 300)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('reports configured when all S3 env vars are set', () => {
    process.env['S3_ENDPOINT'] = 'http://localhost:9000';
    process.env['S3_BUCKET'] = 'lms-bucket';
    process.env['S3_ACCESS_KEY_ID'] = 'minioadmin';
    process.env['S3_SECRET_ACCESS_KEY'] = 'minioadmin';

    const configured = new UploadService();
    expect(configured.isConfigured()).toBe(true);
  });

  it('signs short-lived attachment downloads on the isolated file origin', async () => {
    process.env['S3_ENDPOINT'] = 'https://storage.internal.example';
    process.env['S3_FILE_ORIGIN'] = 'https://files.example.test';
    process.env['S3_BUCKET'] = 'lms-bucket';
    process.env['S3_ACCESS_KEY_ID'] = 'test-access-key';
    process.env['S3_SECRET_ACCESS_KEY'] = 'test-secret-key';

    const configured = new UploadService();
    const signed = new URL(
      await configured.getPresignedUrl('organizations/org/materials/id/object', 'unsafe\r\nname.svg', 3_600),
    );

    expect(signed.origin).toBe('https://files.example.test');
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(signed.searchParams.get('response-content-type')).toBe('application/octet-stream');
    expect(signed.searchParams.get('response-content-disposition')).toContain('attachment;');
    expect(signed.searchParams.get('response-content-disposition')).not.toMatch(/[\r\n]/);
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

  it('creates a tenant-scoped quarantine key', () => {
    expect(service.createQuarantineObjectKey('organization-a', 'material-a')).toMatch(
      /^quarantine\/organizations\/organization-a\/materials\/material-a\/[0-9a-f-]{36}$/,
    );
  });
});
