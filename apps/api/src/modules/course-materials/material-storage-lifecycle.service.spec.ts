import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { UploadService } from '../upload/upload.service.js';
import { MaterialStorageLifecycleService } from './material-storage-lifecycle.service.js';

describe('MaterialStorageLifecycleService', () => {
  const oldDate = new Date('2026-01-01T00:00:00Z');
  const now = new Date('2026-07-31T00:00:00Z');

  afterEach(() => delete process.env['S3_ORPHAN_RETENTION_DAYS']);

  function createService() {
    const deleteObject = jest.fn(async () => undefined);
    const listObjects = jest.fn(async (prefix: string) =>
      prefix.startsWith('quarantine')
        ? [{ key: 'quarantine/organizations/org/materials/orphan/file', lastModified: oldDate }]
        : [
            { key: 'organizations/org/materials/live/file', lastModified: oldDate },
            { key: 'organizations/org/materials/orphan/file', lastModified: oldDate },
            { key: 'organizations/org/materials/new/file', lastModified: now },
          ],
    );
    const prisma = {
      courseMaterial: {
        findMany: jest.fn(async () => [
          { objectKey: 'organizations/org/materials/live/file', quarantineKey: null },
        ]),
      },
    } as unknown as PrismaService;
    const uploads = { listObjects, deleteObject } as unknown as UploadService;
    return { service: new MaterialStorageLifecycleService(prisma, uploads), deleteObject };
  }

  it('defaults to dry-run and never deletes referenced or recent objects', async () => {
    const { service, deleteObject } = createService();
    const result = await service.cleanup({ now });

    expect(result.dryRun).toBe(true);
    expect(result.candidates).toEqual([
      'organizations/org/materials/orphan/file',
      'quarantine/organizations/org/materials/orphan/file',
    ]);
    expect(result.deleted).toEqual([]);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('deletes only retained orphan candidates when explicitly applied', async () => {
    const { service, deleteObject } = createService();
    const result = await service.cleanup({ dryRun: false, now });

    expect(result.deleted).toEqual(result.candidates);
    expect(deleteObject).toHaveBeenCalledTimes(2);
  });
});
