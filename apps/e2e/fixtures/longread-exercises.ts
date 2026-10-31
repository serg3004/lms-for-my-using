import { expect, type Page, type Route } from '@playwright/test';
import type { AssessmentAnswer, QuestionDefinition } from '@lms/shared/assessment-question-types';
import { exerciseContentSchema } from '../../../packages/shared/src/longread-exercises.js';
import type { ExerciseStates, PublicExerciseQuestion, ExerciseResult, WriteLongreadQuestion } from '@lms/shared/longread-exercises';
import type { LongreadQuestionBank } from '../../web/src/shared/api/longreads.js';
import { longreadReaderServer } from './longread-reader.js';
import { longreadEditorServer, longreadFixture, longreadLessonId } from './longread-editor.js';
const uuid = (n: number) => `38900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const items = [{ id: 'a', text: 'Alpha' }, { id: 'b', text: 'Beta' }];
const defs: (QuestionDefinition | null)[] = [null, null, { type: 'true_false', correctAnswer: true }, { type: 'matching', left: items, right: items, correctPairs: [{ leftId: 'a', rightId: 'b' }, { leftId: 'b', rightId: 'a' }] }, { type: 'ordering', items, correctOrder: ['b', 'a'] }, { type: 'fill_blank', blanks: [{ id: 'city', acceptedAnswers: ['Алматы'] }], caseSensitive: false, whitespace: 'trim' }, { type: 'short_answer', acceptedAnswers: ['Café'], caseSensitive: false, whitespace: 'trim' }];
export function exerciseQuestions(): PublicExerciseQuestion[] {
  return ['single_choice', 'multiple_choice', 'true_false', 'matching', 'ordering', 'fill_blank', 'short_answer'].map((type, i) => ({ id: uuid(10 + i), type: type as PublicExerciseQuestion['type'], title: `Exercise ${i + 1}`, text: 'Русский · Қазақша · 中文', imageUrl: null, points: 8, scoringMode: 'all_or_nothing',
    options: i < 2 ? [{ id: uuid(100 + i * 2), text: 'Good', imageUrl: null }, { id: uuid(101 + i * 2), text: 'Bad', imageUrl: null }] : [],
    ...(i === 2 ? { definition: { type: 'true_false' as const } } : i === 3 ? { definition: { type: 'matching' as const, left: items, right: items } } : i === 4 ? { definition: { type: 'ordering' as const, items } } : i === 5 ? { definition: { type: 'fill_blank' as const, blanks: [{ id: 'city' }], caseSensitive: false, whitespace: 'trim' as const } } : i === 6 ? { definition: { type: 'short_answer' as const, caseSensitive: false, whitespace: 'trim' as const } } : {}),
    assessment: { id: uuid(1), title: 'Safety test', passingScore: 70, maxAttempts: 2 } }));
}
export function exerciseDraft() {
  const draft = structuredClone(longreadFixture), questions = exerciseQuestions();
  draft.chapters = [{ ...draft.chapters[0]!, blocks: questions.map((question, i) => ({ id: uuid(200 + i), type: 'exercise', schemaVersion: 1, known: true,
    content: exerciseContentSchema.parse({ questionId: question.id, mode: 'graded', weight: 8, maxAttempts: 2, hint: 'Подсказка без ключа', feedback: i === 0 ? 'answers' : 'result' }), question })) }];
  return draft;
}
/** Transport fixture only. Real grading, CAS, entitlement, concurrency and snapshots are covered with PostgreSQL. */
export function exerciseReaderServer({ direction = 'ltr' as 'ltr' | 'rtl', preview = false } = {}) {
  const server = longreadReaderServer({ readingOrder: 'free', direction }), draft = exerciseDraft();
  server.draft.chapters = draft.chapters;
  const questions = exerciseQuestions(), state: ExerciseStates = { version: 1, exercises: questions.map((_, i) => ({ blockId: uuid(200 + i), attemptsUsed: 0, nextAttempt: 1, remaining: 2, testExhausted: false, lastResult: null })), tests: [{ ...questions[0]!.assessment, attemptsUsed: 0, remaining: 2, requiredRemaining: 7, latest: null }] };
  const writes: { path: string; body: Record<string, unknown> }[] = []; let failure = 0;
  async function routes(page: Page) {
    await page.route('**/api/v1/**/longread/exercises**', async (route: Route) => {
      const path = new URL(route.request().url()).pathname, method = route.request().method();
      if (method === 'GET') return route.fulfill({ json: state });
      const body = route.request().postDataJSON() as Record<string, unknown>; writes.push({ path, body });
      if (failure) { const status = failure; failure = 0; return route.fulfill({ status, json: { message: 'Synthetic failure' } }); }
      if (path.endsWith('/finish')) { state.tests[0]!.latest = { attemptId: uuid(999), score: 56, maxScore: 56, percentage: 100, passed: true }; state.tests[0]!.attemptsUsed = 1; return route.fulfill({ json: { attemptId: uuid(999), state } }); }
      const index = questions.findIndex((_, i) => path.includes(uuid(200 + i))), answer = body.answer as AssessmentAnswer;
      const good = index < 2 ? answer.selectedOptionId === questions[index]!.options[0]!.id || answer.selectedOptionIds?.[0] === questions[index]!.options[0]!.id : index === 2 ? answer.response?.type === 'true_false' && answer.response.value : index === 3 ? answer.response?.type === 'matching' && answer.response.pairs.every((p) => p.leftId !== p.rightId) : index === 4 ? answer.response?.type === 'ordering' && answer.response.itemIds[0] === 'b' : index === 5 ? answer.response?.type === 'fill_blank' && answer.response.blanks[0]?.value === 'Алматы' : answer.response?.type === 'short_answer' && answer.response.text === 'Café';
      const result: ExerciseResult = { answer, score: good ? 8 : 0, maxScore: 8, percentage: good ? 100 : 0, passed: !!good, isCorrect: !!good, ...(index === 0 ? { correctOptionIds: [questions[0]!.options[0]!.id] } : {}) };
      if (preview) return route.fulfill({ json: { ...result, preview: true } });
      const item = state.exercises[index]!; item.attemptsUsed++; item.remaining--; item.nextAttempt++; item.lastResult = { ...result, attempt: item.attemptsUsed, attemptId: uuid(1000 + index * 10 + item.attemptsUsed) };
      state.tests[0]!.requiredRemaining = state.exercises.filter((v) => !v.attemptsUsed).length;
      return route.fulfill({ json: { ...state, acceptedAttemptId: item.lastResult.attemptId, acceptedResult: item.lastResult } });
    });
    if (preview) await page.route('**/api/v1/**/longread/preview?*', async (route) => {
      return route.fulfill({ json: { lessonId: longreadLessonId, schemaVersion: 1, settings: draft.settings, chapters: draft.chapters, navigation: { chapter: 'intro', headingIndex: null, allowedAnchors: ['intro'], previousAnchor: null, nextAnchor: null }, preview: true, version: null, draftRevision: 1 } });
    });
  }
  return { attach: async (page: Page, locale: 'ru' | 'en' | 'kk' | 'zh' = 'ru') => { if (preview) { await exerciseEditorServer().attach(page, { locale }); await routes(page); await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click(); } else await server.attach(page, { locale, beforeNavigate: () => routes(page) }); await expect(page.getByRole('region', { name: 'Exercise 1', exact: true })).toBeVisible(); }, writes, state, failNext: (status: number) => { failure = status; } };
}
export function exerciseEditorServer(index?: number) {
  const draft = exerciseDraft(); if (index !== undefined) draft.chapters[0]!.blocks = [draft.chapters[0]!.blocks[index]!];
  const editor = longreadEditorServer(draft), qs = exerciseQuestions();
  const bank: LongreadQuestionBank = [{ ...qs[0]!.assessment, questions: qs.map((q, i) => ({ id: q.id, assessmentId: q.assessment.id, type: q.type, title: q.title, text: q.text, definition: defs[i]!, scoringMode: q.scoringMode, updatedAt: '2026-10-31T00:00:00.000Z', options: q.options.map((o, order) => ({ ...o, isCorrect: order === 0, order })) })) }];
  const writes: WriteLongreadQuestion[] = [];
  return { editor, writes, attach: (page: Page, options: { role?: 'admin' | 'instructor'; locale?: 'ru' | 'en' | 'kk' | 'zh' } = {}) => editor.attach(page, { ...options, beforeNavigate: async () => {
    await page.route('**/api/v1/**/longread/questions', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: bank });
      const body = route.request().postDataJSON() as { revision: number; question: WriteLongreadQuestion }; writes.push(body.question);
      editor.bumpRevision(); return route.fulfill({ json: { questionId: body.question.questionId ?? uuid(400 + writes.length), revision: body.revision + 1 } });
    });
    await page.route('**/api/v1/**/longread/publish', (route) => route.fulfill({ json: { version: 2 } }));
  } }) };
}
