import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { UploadService } from '../upload/upload.service.js';

export type LifecycleCleanupResult = {
  dryRun: boolean;
  retentionDays: number;
  scanned: number;
  candidates: string[];
  deleted: string[];
};

@Injectable()
export class MaterialStorageLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadService,
  ) {}

  async cleanup(options: { dryRun?: boolean; now?: Date } = {}): Promise<LifecycleCleanupResult> {
    const dryRun = options.dryRun ?? true;
    const retentionDays = Math.max(Number(process.env['S3_ORPHAN_RETENTION_DAYS'] ?? 30), 1);
    const cutoff = (options.now ?? new Date()).getTime() - retentionDays * 86_400_000;
    const referencedRows = await this.prisma.courseMaterial.findMany({
      where: { OR: [{ objectKey: { not: null } }, { quarantineKey: { not: null } }] },
      select: { objectKey: true, quarantineKey: true },
    });
    const referenced = new Set(
      referencedRows.flatMap((row) => [row.objectKey, row.quarantineKey]).filter((key): key is string => Boolean(key)),
    );
    const objects = (await Promise.all([
      this.uploads.listObjects('organizations/'),
      this.uploads.listObjects('quarantine/organizations/'),
    ])).flat();
    const candidates = objects
      .filter((object) => object.lastModified.getTime() < cutoff && !referenced.has(object.key))
      .map((object) => object.key);

    if (!dryRun) {
      for (const key of candidates) await this.uploads.deleteObject(key);
    }
    return { dryRun, retentionDays, scanned: objects.length, candidates, deleted: dryRun ? [] : candidates };
  }
}
