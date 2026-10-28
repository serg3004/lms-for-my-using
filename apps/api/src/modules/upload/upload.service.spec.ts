import { ServiceUnavailableException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { s3Errors } from '../../common/observability/metrics.js';

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

  it('records failed storage operations without storage identifiers in metric labels', async () => {
    let middleware: ((next: (args: unknown) => Promise<unknown>, context: { commandName?: string }) =>
      (args: unknown) => Promise<unknown>) | undefined;
    const client = { middlewareStack: { add: jest.fn((value) => { middleware = value; }) } };
    const metricService = Object.create(UploadService.prototype) as UploadService;

    (metricService as unknown as { addMetricsMiddleware(client: unknown): void }).addMetricsMiddleware(client);
    const failure = new Error('contains-private-object-key');
    const before = (await s3Errors.get()).values.find(({ labels }) => labels.operation === 'PutObject')?.value ?? 0;
    const handler = middleware?.(jest.fn().mockRejectedValue(failure), { commandName: 'PutObjectCommand' });

    await expect(handler?.({ input: { Bucket: 'private-bucket', Key: 'private-key' } })).rejects.toBe(failure);
    const sample = (await s3Errors.get()).values.find(({ labels }) => labels.operation === 'PutObject');
    expect(sample?.value).toBe(before + 1);
    expect(sample?.labels).toEqual({ operation: 'PutObject' });
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

  it('throws ServiceUnavailableException on uploadChecklistCover when not configured', async () => {
    const file = { originalname: 'cover.png', mimetype: 'image/png', buffer: Buffer.from([1]), size: 1 } as Express.Multer.File;

    await expect(service.uploadChecklistCover(file, 'org-1', 'checklist-1')).rejects.toThrow(ServiceUnavailableException);
  });

  it('stores a checklist cover under a tenant and checklist scoped opaque key', async () => {
    process.env['S3_ENDPOINT'] = 'https://storage.internal.example';
    process.env['S3_BUCKET'] = 'lms-bucket';
    process.env['S3_ACCESS_KEY_ID'] = 'test-access-key';
    process.env['S3_SECRET_ACCESS_KEY'] = 'test-secret-key';
    const configured = new UploadService();
    const send = jest.fn(async () => ({}));
    (configured as unknown as { s3: { send: typeof send } }).s3 = { send };
    const file = { originalname: 'cover.png', mimetype: 'image/png', buffer: Buffer.from([1, 2]), size: 2 } as Express.Multer.File;

    const uploaded = await configured.uploadChecklistCover(file, 'org-1', 'checklist-1');

    expect(uploaded.objectKey).toMatch(/^organizations\/org-1\/checklist-covers\/checklist-1\/[0-9a-f-]{36}$/);
    expect(uploaded).toMatchObject({ mimeType: 'image/png', sizeBytes: 2 });
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0] as unknown as [{ input: { Bucket: string; Key: string; ContentType: string } }])[0].input).toMatchObject({
      Bucket: 'lms-bucket',
      Key: uploaded.objectKey,
      ContentType: 'image/png',
    });
  });

  it('copies a checklist cover to a new opaque key of the target checklist', async () => {
    process.env['S3_ENDPOINT'] = 'https://storage.internal.example';
    process.env['S3_BUCKET'] = 'lms-bucket';
    process.env['S3_ACCESS_KEY_ID'] = 'test-access-key';
    process.env['S3_SECRET_ACCESS_KEY'] = 'test-secret-key';
    const configured = new UploadService();
    const send = jest.fn(async () => ({}));
    (configured as unknown as { s3: { send: typeof send } }).s3 = { send };

    const key = await configured.copyChecklistCover('organizations/org-1/checklist-covers/source/aaa', 'org-1', 'copy-1');

    expect(key).toMatch(/^organizations\/org-1\/checklist-covers\/copy-1\/[0-9a-f-]{36}$/);
    expect((send.mock.calls[0] as unknown as [{ input: { Bucket: string; Key: string; CopySource: string } }])[0].input).toMatchObject({
      Bucket: 'lms-bucket',
      Key: key,
      CopySource: 'lms-bucket/organizations/org-1/checklist-covers/source/aaa',
    });
  });

  it('throws ServiceUnavailableException on copyChecklistCover when not configured', async () => {
    await expect(service.copyChecklistCover('k', 'org-1', 'c')).rejects.toThrow(ServiceUnavailableException);
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

  it('signs a bounded multipart part URL without contacting the API with file bytes', async () => {
    process.env['S3_ENDPOINT'] = 'https://storage.example.test';
    process.env['S3_BUCKET'] = 'lms-bucket';
    process.env['S3_ACCESS_KEY_ID'] = 'test-access-key';
    process.env['S3_SECRET_ACCESS_KEY'] = 'test-secret-key';
    const configured = new UploadService();
    const signed = new URL(await configured.getMultipartPartUrl(
      'quarantine/organizations/org/materials/material/key', 'upload-id', 3, 3_600,
    ));

    expect(signed.searchParams.get('partNumber')).toBe('3');
    expect(signed.searchParams.get('uploadId')).toBe('upload-id');
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('900');
  });
});
