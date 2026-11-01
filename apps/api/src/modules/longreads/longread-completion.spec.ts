import { chapterAccessible, completionState, completionView, exerciseReasons } from './longread-completion.js';
import { exerciseContentSchema } from '@lms/shared/longread-exercises';
import type { ReaderSnapshot } from './longread-reader.js';
import type { VersionLearning } from '@lms/shared/longread-progress';
const a = '39000000-0000-4000-8000-000000000001', gate = '39000000-0000-4000-8000-000000000002', b = '39000000-0000-4000-8000-000000000003';
const exercise = (id: string) => ({ id, type: 'exercise', schemaVersion: 1, content: exerciseContentSchema.parse({ maxAttempts: 2 }) });
const snapshot: ReaderSnapshot = { lessonId: 'lesson', version: 1, schemaVersion: 1, settings: { readingOrder: 'free', requiredChapters: 1, tableOfContents: 'off', direction: 'ltr', allowCopy: true }, chapters: [
  { title: 'First', anchor: 'first', blocks: [exercise(a), { id: gate, type: 'continue', schemaVersion: 1, content: { mode: 'correct', minViewSeconds: 10 } }, exercise(b)] },
  { title: 'Second', anchor: 'second', blocks: [] }, { title: 'Optional', anchor: 'optional', blocks: [] },
] };
describe('longread completion policy', () => {
  it('gates free navigation on required predecessors, sequential navigation on every predecessor', () => {
    const learning: VersionLearning = { chapters: { first: { enteredAt: '2026-11-01T00:00:00Z', completedAt: '2026-11-01T00:00:01Z', passed: [] } } };
    expect(chapterAccessible(snapshot, learning, 2)).toBe(true);
    expect(chapterAccessible({ ...snapshot, settings: { ...snapshot.settings, readingOrder: 'sequential' } }, learning, 2)).toBe(false);
    expect(chapterAccessible(snapshot, { chapters: {} }, 2)).toBe(false);
  });
  it('distinguishes missing, incorrect and exhausted answers, accepting an earlier correct answer', () => {
    const row = { longreadBlockId: a, countsTowardResults: false, assessmentId: 'test', answers: [{ isCorrect: false }] };
    expect(exerciseReasons([exercise(a)], [], true)[0]?.code).toBe('unanswered');
    expect(exerciseReasons([exercise(a)], [row], true)[0]?.code).toBe('incorrect');
    expect(exerciseReasons([exercise(a)], [row, row], true)[0]?.code).toBe('exhausted');
    expect(exerciseReasons([exercise(a)], [row], false)).toEqual([]);
    expect(exerciseReasons([exercise(a)], [row, { ...row, answers: [{ isCorrect: true }] }], true)).toEqual([]);
  });
  it('the first gate excludes B and time is evaluated against the supplied server clock', async () => {
    const learning: VersionLearning = { chapters: { first: { enteredAt: '2026-11-01T00:00:00Z', passed: [] } } };
    const row = { longreadBlockId: a, countsTowardResults: false, assessmentId: 'test', answers: [{ isCorrect: true }] };
    const state = await completionState({ courseMaterial: {} } as never, 'document', snapshot, learning, [row], new Date('2026-11-01T00:00:10Z'));
    expect(state.chapters[0]?.gates[0]?.reasons).toEqual([]);
    expect(state.chapters[0]?.reasons).toContainEqual({ code: 'unanswered', blockId: b });
    const view = completionView({ chapters: snapshot.chapters, navigation: { chapter: 'first', allowedAnchors: [], nextAnchor: 'second' } }, state);
    expect(view.chapters[0]?.blocks).toHaveLength(2); expect(view.navigation.nextAnchor).toBeNull();
    const earlier = await completionState({ courseMaterial: {} } as never, 'document', snapshot, learning, [row], new Date('2026-11-01T00:00:05Z'));
    expect(earlier.chapters[0]?.gates[0]?.reasons).toContainEqual({ code: 'time', remainingSeconds: 5 });
  });
});
