import type { Prisma } from '@prisma/client';

// Folder topology and assessment membership changes share the same organization lock.
export async function lockAssessmentFolders(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('assessment_folders'), hashtext(${organizationId}::uuid::text))`;
}
