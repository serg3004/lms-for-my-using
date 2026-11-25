import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { stableJson } from '../../common/stable-json.js';
import { frozenAssessmentQuestionSchema, type FrozenAssessmentQuestion } from '../../common/assessment-frozen.js';

export async function refreshPublishedAssessmentExercises(tx: Prisma.TransactionClient, organizationId: string, lessonIds: string[],
  replace: (question: FrozenAssessmentQuestion, blockId: string) => FrozenAssessmentQuestion | null, actorId?: string) {
  if (!lessonIds.length) return;
  const documents = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM longread_documents WHERE organization_id = ${organizationId}::uuid
      AND lesson_id IN (${Prisma.join(lessonIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id FOR UPDATE
  `;
  const snapshotSchema = z.array(z.looseObject({ blocks: z.array(z.looseObject({ id: z.string(), question: z.unknown().optional() })) }));
  for (const { id } of documents) {
    const document = await tx.longreadDocument.findUniqueOrThrow({ where: { id }, include: { publishedRevision: true } });
    const revision = document.publishedRevision;
    if (!revision) continue;
    let changed = false;
    const snapshot = snapshotSchema.parse(revision.snapshot).map((chapter) => ({
      ...chapter,
      blocks: chapter.blocks.flatMap((block) => {
        const old = frozenAssessmentQuestionSchema.safeParse(block.question);
        if (!old.success) return [block];
        const question = replace(old.data, block.id);
        if (question === old.data || (question && stableJson(question) === stableJson(old.data))) return [block];
        changed = true;
        return question ? [{ ...block, question }] : [];
      }),
    }));
    if (!changed) continue;
    const next = await tx.longreadRevision.create({ data: {
      documentId: id, organizationId, number: document.lastRevisionNumber + 1,
      schemaVersion: revision.schemaVersion, sourceDraftRevision: revision.sourceDraftRevision,
      settings: revision.settings ?? Prisma.JsonNull, snapshot: snapshot as Prisma.InputJsonValue,
      createdById: actorId,
    } });
    await tx.longreadDocument.update({ where: { id }, data: { publishedRevisionId: next.id, lastRevisionNumber: next.number } });
  }
}
