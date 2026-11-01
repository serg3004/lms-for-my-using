import { continueContentSchema, type CompletionReason, type LongreadCompletion, type VersionLearning } from '@lms/shared/longread-progress';
import { exerciseContentSchema } from '@lms/shared/longread-exercises';
import type { Prisma } from '@prisma/client';
import { checkLongreadFiles } from './longread-file-references.js';
import type { ReaderSnapshot, ReaderChapter } from './longread-reader.js';
type Attempt = { longreadBlockId: string | null; assessmentId: string; countsTowardResults: boolean; answers: { isCorrect: boolean }[] };
export function requiredCount(snapshot: ReaderSnapshot) { return snapshot.settings.requiredChapters || snapshot.chapters.length; }
export function chapterAccessible(snapshot: ReaderSnapshot, learning: VersionLearning, index: number) {
  return snapshot.chapters.slice(0, index).every((chapter, prior) => snapshot.settings.readingOrder === 'free' && prior >= requiredCount(snapshot) || !!learning.chapters[chapter.anchor]?.completedAt);
}
export function exerciseReasons(blocks: ReaderChapter['blocks'], attempts: Attempt[], correct: boolean): CompletionReason[] {
  return blocks.filter((b) => b.type === 'exercise').flatMap<CompletionReason>((block) => {
    const parsed = exerciseContentSchema.safeParse(block.content); if (!parsed.success || !block.id) return [{ code: 'unanswered' as const, blockId: block.id }];
    const rows = attempts.filter((a) => a.longreadBlockId === block.id);
    if (correct ? rows.some((a) => a.answers.some((answer) => answer.isCorrect)) : rows.length) return [];
    const parent = block.question?.assessment;
    const parentExhausted = parsed.data.mode === 'graded' && parent?.maxAttempts !== null && parent?.maxAttempts !== undefined && attempts.filter((a) => a.countsTowardResults && a.assessmentId === parent.id).length >= parent.maxAttempts;
    return [{ code: rows.length >= parsed.data.maxAttempts || parentExhausted ? 'exhausted' as const : rows.length ? 'incorrect' as const : 'unanswered' as const, blockId: block.id }];
  });
}
export async function completionState(db: Pick<Prisma.TransactionClient, 'courseMaterial'>, documentId: string, snapshot: ReaderSnapshot, learning: VersionLearning, attempts: Attempt[], now: Date): Promise<LongreadCompletion> {
  const count = requiredCount(snapshot);
  const chapters = await Promise.all(snapshot.chapters.map(async (chapter, index) => {
    const saved = learning.chapters[chapter.anchor], accessible = chapterAccessible(snapshot, learning, index);
    if (!accessible) return { anchor: chapter.anchor, title: chapter.title, required: index < count, completedAt: saved?.completedAt ?? null, accessible, reasons: [{ code: 'locked' as const }], gates: [] };
    const elapsed = saved ? Math.max(0, (now.getTime() - new Date(saved.enteredAt).getTime()) / 1000) : 0;
    const files = async (blocks: ReaderChapter['blocks']) => (await checkLongreadFiles(db, documentId, { settings: { cover: snapshot.settings.cover }, chapters: [{ cover: chapter.cover, blocks }] }, true)).length ? [{ code: 'file_unavailable' as const }] : [];
    const gates = await Promise.all(chapter.blocks.flatMap((block, position) => {
      if (block.type !== 'continue' || !block.id) return [];
      return [(async () => {
        const config = continueContentSchema.parse(block.content), passed = !!saved?.passed.includes(block.id!);
        if (passed) return { blockId: block.id!, passed, reasons: [] };
        const priorGate = chapter.blocks.slice(0, position).find((b) => b.type === 'continue' && b.id && !saved?.passed.includes(b.id));
        if (priorGate) return { blockId: block.id!, passed, reasons: [{ code: 'continue_required' as const, blockId: priorGate.id }] };
        const reasons: CompletionReason[] = [];
        if (config.mode !== 'free') reasons.push(...exerciseReasons(chapter.blocks.slice(0, position), attempts, config.mode === 'correct'));
        if (elapsed < config.minViewSeconds) reasons.push({ code: 'time', remainingSeconds: Math.ceil(config.minViewSeconds - elapsed) });
        reasons.push(...await files(chapter.blocks.slice(0, position)));
        return { blockId: block.id!, passed, reasons };
      })()];
    }));
    const required = chapter.blocks.filter((b) => b.type === 'exercise' && exerciseContentSchema.parse(b.content).required);
    const reasons: CompletionReason[] = accessible ? [...exerciseReasons(required, attempts, false), ...gates.filter((g) => !g.passed).map((g) => ({ code: 'continue_required' as const, blockId: g.blockId })), ...gates.flatMap((g) => g.reasons), ...await files(chapter.blocks)] : [{ code: 'locked' }];
    return { anchor: chapter.anchor, title: chapter.title, required: index < count, completedAt: saved?.completedAt ?? null, accessible, reasons: saved?.completedAt ? [] : reasons, gates };
  }));
  const completedCount = chapters.filter((c) => c.required && c.completedAt).length;
  return { version: snapshot.version, percentage: count ? Math.round(completedCount / count * 100) : 100, requiredCount: count, completedCount, completed: completedCount === count, chapters };
}
/** Keep only the prefix unlocked by accepted Continue actions; guessing an id cannot reveal later exercises. */
export function completionView<T extends { chapters: ReaderChapter[]; navigation: { chapter: string; allowedAnchors: string[]; nextAnchor: string | null } }>(view: T, completion: LongreadCompletion) {
  return { ...view, completion, chapters: view.chapters.map((chapter) => {
    const state = completion.chapters.find((c) => c.anchor === chapter.anchor)!;
    const boundary = chapter.blocks.findIndex((b) => b.type === 'continue' && state.gates.some((g) => g.blockId === b.id && !g.passed));
    return { ...chapter, ...(!state.accessible ? { blocks: [], cover: null } : boundary >= 0 ? { blocks: chapter.blocks.slice(0, boundary + 1) } : {}) };
  }), navigation: { ...view.navigation, allowedAnchors: completion.chapters.filter((c) => c.accessible).map((c) => c.anchor), nextAnchor: completion.chapters.find((c) => c.anchor === view.navigation.nextAnchor)?.accessible ? view.navigation.nextAnchor : null } };
}
