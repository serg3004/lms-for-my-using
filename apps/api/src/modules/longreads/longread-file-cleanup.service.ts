import { PrismaService } from '../../database/prisma.service.js';
import { collectFileIds } from '../upload/public.js';

/** Before the existing storage cleanup, release old files absent from both the draft and every immutable version. */
export class LongreadFileCleanupService {
  constructor(private readonly prisma: PrismaService) {}
  async cleanup(dryRun = true, now = new Date()) {
    const retentionDays = Math.max(Number(process.env['S3_ORPHAN_RETENTION_DAYS'] ?? 30), 1);
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const candidates: string[] = [];
    let cursor: string | undefined;
    do {
      const documents = await this.prisma.longreadDocument.findMany({ orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), where: { files: { some: { updatedAt: { lt: cutoff } } } }, select: { id: true } });
      if (!documents.length) break;
      for (const { id } of documents) await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM longread_documents WHERE id = ${id}::uuid FOR UPDATE`;
        const doc = await tx.longreadDocument.findUnique({ where: { id }, include: { chapters: { include: { blocks: { select: { content: true } } } }, revisions: { select: { settings: true, snapshot: true } } } });
        if (!doc) return;
        const referenced = [...collectFileIds(doc)];
        const orphaned = await tx.courseMaterial.findMany({ where: { longreadDocumentId: id, updatedAt: { lt: cutoff }, id: { notIn: referenced }, multipartUploads: { none: { status: 'pending' } } }, select: { id: true } });
        candidates.push(...orphaned.map((file) => file.id));
        if (!dryRun && orphaned.length) await tx.courseMaterial.deleteMany({ where: { id: { in: orphaned.map((file) => file.id) }, longreadDocumentId: id } });
      });
      cursor = documents.at(-1)!.id;
      if (documents.length < 100) break;
    } while (cursor);
    return { dryRun, retentionDays, candidates, deleted: dryRun ? [] : candidates };
  }
}
