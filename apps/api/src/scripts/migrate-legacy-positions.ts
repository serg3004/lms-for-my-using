import { PrismaService } from '../database/prisma.service.js';
import { LegacyPositionMigrationService } from '../modules/positions/legacy-position-migration.service.js';
import { legacyPositionMapping } from './migrate-legacy-positions.mapping.js';

const prisma = new PrismaService();
const apply = process.argv.includes('--apply');
const organizationId = process.argv.find((arg) => arg.startsWith('--organization='))?.split('=')[1];

try {
  const service = new LegacyPositionMigrationService(prisma);
  const report = await service.run(legacyPositionMapping, { dryRun: !apply, organizationId });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
