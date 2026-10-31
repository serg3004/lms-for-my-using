import { randomUUID } from 'node:crypto';
import { captureExerciseQuestions, publicExerciseQuestion } from './longread-exercise-snapshot.js';
import { exerciseContentSchema } from '@lms/shared/longread-exercises';
import type { PrismaService } from '../../database/prisma.service.js';
import type { SnapshotChapter } from './longread-publish-check.js';
import { stableJson } from '../../common/stable-json.js';
const q = { id: randomUUID(), type: 'short_answer' as const, title: 'Question', text: null, imageUrl: null, order: 0, points: 10, scoringMode: 'all_or_nothing' as const,
  definition: { type: 'short_answer' as const, acceptedAnswers: ['secret'], caseSensitive: false, whitespace: 'trim' as const }, options: [], assessment: { id: randomUUID(), title: 'Test', passingScore: 70, maxAttempts: null } };
const chapter = (count = 1): SnapshotChapter[] => [{ title: 'Chapter', anchor: 'intro', hidden: false, blocks: Array.from({ length: count }, () => ({ id: randomUUID(), type: 'exercise', schemaVersion: 1, content: exerciseContentSchema.parse({ questionId: q.id, mode: 'graded', weight: 1_000_000 }) })) }];
const db = (rows = [q]) => ({ $queryRaw: async () => rows.map((question) => ({ question })) }) as unknown as PrismaService;
describe('exercise publication snapshots', () => {
  it('captures server keys and block weight, and explicitly removes keys from the reader view', async () => {
    const original = chapter(), captured = await captureExerciseQuestions(db(), 'lesson', 'org', original);
    expect(captured.reasons).toEqual([]); const question = captured.chapters[0]!.blocks[0]!.question!;
    expect(question.points).toBe(1_000_000); expect(question.definition).toEqual(q.definition);
    expect(JSON.stringify(publicExerciseQuestion(question, 'seed'))).not.toMatch(/acceptedAnswers|secret/);
    expect(original[0]!.blocks[0]).not.toHaveProperty('question');
  });
  it('reports unavailable/foreign/deleted questions without fabricating a usable snapshot', async () => {
    const captured = await captureExerciseQuestions(db([]), 'lesson', 'org', chapter());
    expect(captured.reasons[0]?.code).toBe('question_unavailable'); expect(captured.chapters[0]!.blocks[0]).not.toHaveProperty('question');
  });
  it('refuses aggregate weights that cannot be persisted as PostgreSQL int scores', async () => {
    expect((await captureExerciseQuestions(db(), 'lesson', 'org', chapter(2148))).reasons).toContainEqual(expect.objectContaining({ code: 'invalid_block' }));
  });
  it('canonicalizes JSONB object order but preserves answer and block order', () => {
    expect(stableJson({ b: 1, a: { y: 2, x: 3 } })).toBe(stableJson({ a: { x: 3, y: 2 }, b: 1 }));
    expect(stableJson(['b', 'a'])).not.toBe(stableJson(['a', 'b']));
  });
});
