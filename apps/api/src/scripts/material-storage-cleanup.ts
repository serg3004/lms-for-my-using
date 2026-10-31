import { LongreadFileCleanupService } from '../modules/longreads/longread-file-cleanup.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { MaterialStorageLifecycleService } from '../modules/course-materials/material-storage-lifecycle.service.js';
import { UploadService } from '../modules/upload/upload.service.js';

const prisma = new PrismaService();
const apply = process.argv.includes('--apply');

try {
  const longreadFiles = await new LongreadFileCleanupService(prisma).cleanup(!apply);
  const service = new MaterialStorageLifecycleService(prisma, new UploadService());
  const result = await service.cleanup({ dryRun: !apply });
  process.stdout.write(`${JSON.stringify({ ...result, longreadFiles }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
