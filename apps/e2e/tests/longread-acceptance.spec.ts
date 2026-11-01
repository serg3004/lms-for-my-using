import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { LongreadQuestionBank, LongreadReaderDocument } from '../../web/src/shared/api/longreads.js';
import { acceptanceFixture, json, writable } from '../fixtures/longread-acceptance.js';

const pairs = [{ id: 'a', text: 'Alpha' }, { id: 'b', text: 'Beta' }];
const questions = [
  { type: 'single_choice', options: [{ text: 'Good', isCorrect: true }, { text: 'Bad', isCorrect: false }] },
  { type: 'multiple_choice', options: [{ text: 'Good', isCorrect: true }, { text: 'Bad', isCorrect: false }] },
  { type: 'true_false', definition: { type: 'true_false', correctAnswer: true } },
  { type: 'matching', definition: { type: 'matching', left: pairs, right: pairs, correctPairs: [{ leftId: 'a', rightId: 'b' }, { leftId: 'b', rightId: 'a' }] } },
  { type: 'ordering', definition: { type: 'ordering', items: pairs, correctOrder: ['b', 'a'] } },
  { type: 'fill_blank', definition: { type: 'fill_blank', blanks: [{ id: 'city', acceptedAnswers: ['Алматы'] }], caseSensitive: false, whitespace: 'trim' } },
  { type: 'short_answer', definition: { type: 'short_answer', acceptedAnswers: ['Café'], caseSensitive: false, whitespace: 'trim' } },
];
async function answer(page: Page, index: number) {
  const block = page.getByRole('region', { name: `Acceptance question ${index + 1}`, exact: true });
  if (index < 2) await block.getByLabel('Good', { exact: true }).check();
  else if (index === 2) await block.getByRole('radio').first().check();
  else if (index === 3) { await block.getByLabel('Alpha', { exact: true }).selectOption('b'); await block.getByLabel('Beta', { exact: true }).selectOption('a'); }
  else if (index === 4) { const controls = block.getByRole('combobox'); await controls.nth(0).selectOption('b'); await controls.nth(1).selectOption('a'); }
  else await block.getByRole('textbox').fill(index === 5 ? 'Алматы' : 'Café');
  await block.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
  await expect(block.getByRole('status')).toContainText('8 / 8');
}

test('real longread: author → v1 → learner → v2 → second learner; negatives and immutable v1 results', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const f = await acceptanceFixture(browser, baseURL!);
  try {
    const { author, first, second, foreign, root } = f;
    await test.step('draft/tenant/feature guards reject access before any learning writes', async () => {
      expect((await first.api.get(root)).status()).toBe(403);
      expect((await first.api.get(`${root}/published`)).status()).toBe(404);
      expect((await foreign.api.get(root)).status()).toBe(404);
      await f.db.organization.update({ where: { id: f.org.id }, data: { longreadEnabled: false } });
      expect((await author.api.get(root)).status()).toBe(404);
      await f.db.organization.update({ where: { id: f.org.id }, data: { longreadEnabled: true } });
      expect(await f.db.progress.count({ where: { organizationId: f.org.id } })).toBe(0);
    });
    const ids: string[] = [];
    for (const [index, question] of questions.entries()) {
      const draft = await f.draft();
      ids.push((await json<{ questionId: string }>(author.api.post(`${root}/questions`, { data: { revision: draft.revision, question: { ...question, title: `Acceptance question ${index + 1}` } } }))).questionId);
    }
    let draft = await f.draft();
    const exercise = (questionId: string) => ({ type: 'exercise', content: { questionId, weight: 8, mode: 'graded', maxAttempts: 1, feedback: 'result' } });
    draft = await f.save({ ...writable(draft), settings: { ...draft.settings, readingOrder: 'sequential' }, chapters: [{ id: draft.chapters[0]!.id, title: 'Acceptance chapter', hidden: false, blocks: [
      { type: 'paragraph', content: { runs: [{ text: 'Acceptance content v1' }] } },
      { type: 'table', content: { columns: 1, rows: [{ cells: [{ runs: [{ text: 'Table data' }] }] }] } },
      { type: 'attachments', content: { files: [{ fileId: f.files[0]!.id, label: 'Guide' }] } },
      ...ids.slice(0, 3).map(exercise), { type: 'continue', content: { mode: 'correct' } },
      ...ids.slice(3).map(exercise), { type: 'continue', content: { mode: 'correct' } },
    ] }] });
    await test.step('reject unsafe HTML and stale saves atomically', async () => {
      const bad = writable(draft); bad.chapters[0]!.blocks[0]!.content = { html: '<script>alert(1)</script>' };
      expect((await author.api.put(root, { data: bad })).status()).toBe(400);
      expect((await author.api.put(root, { data: { ...writable(draft), revision: draft.revision - 1 } })).status()).toBe(409);
      expect((await f.draft()).revision).toBe(draft.revision);
    });
    await test.step('publication rejects an unready attachment', async () => {
      await f.db.courseMaterial.update({ where: { id: f.files[0]!.id }, data: { scanStatus: 'pending' } });
      expect((await author.api.post(`${root}/publish`, { data: { revision: draft.revision } })).status()).toBe(422);
      expect(await f.db.longreadRevision.count({ where: { documentId: f.document.id } })).toBe(0);
      await f.db.courseMaterial.update({ where: { id: f.files[0]!.id }, data: { scanStatus: 'available' } });
    });
    const authorPage = await author.context.newPage();
    await authorPage.goto(`/admin/lessons/${f.lesson.id}/longread`);
    await authorPage.getByRole('button', { name: 'Опубликовать версию', exact: true }).click();
    await expect(authorPage.getByRole('status').filter({ hasText: 'Опубликована версия 1.' })).toBeVisible();
    const bank = await json<LongreadQuestionBank>(author.api.get(`${root}/questions`));
    async function complete(actor: typeof first, version: number) {
      const page = await actor.context.newPage(); await page.goto(`/learn/lessons/${f.lesson.id}`);
      await expect(page.getByText(`Acceptance content v${version}`, { exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Acceptance question 4', exact: true })).toHaveCount(0);
      for (let i = 0; i < 3; i++) await answer(page, i);
      await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
      for (let i = 3; i < 7; i++) await answer(page, i);
      await page.getByRole('button', { name: 'Продолжить', exact: true }).last().click();
      await page.getByRole('button', { name: 'Завершить главу', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Состояние прохождения', exact: true })).toContainText('Готово');
      await page.getByRole('button', { name: 'Завершить итоговый тест', exact: true }).click();
      await expect(page.getByRole('link', { name: 'Открыть результат', exact: true })).toBeVisible();
      await page.reload();
      const state = await json<LongreadReaderDocument>(actor.api.get(`${root}/published`));
      expect(state.version).toBe(version); expect(state.completion).toMatchObject({ completed: true, percentage: 100 });
      return state;
    }
    const old = await complete(first, 1);
    await test.step('duplicate submission consumes one slot; exhausted attempt is rejected', async () => {
      const block = old.chapters[0]!.blocks.find((b) => b.type === 'exercise')!, question = bank[0]!.questions.find((q) => q.id === ids[0])!;
      const data = { version: 1, expectedAttempt: 1, requestId: randomUUID(), answer: { questionId: question.id, selectedOptionId: question.options[0]!.id } };
      const responses = await Promise.all([first.api.post(`${root}/exercises/${block.id}/attempts`, { data }), first.api.post(`${root}/exercises/${block.id}/attempts`, { data })]);
      const values = await Promise.all(responses.map((r) => json<{ acceptedAttemptId: string }>(r)));
      expect(values[0]!.acceptedAttemptId).toBe(values[1]!.acceptedAttemptId);
      expect(await f.db.assessmentAttempt.count({ where: { organizationId: f.org.id, userId: first.id, countsTowardResults: false } })).toBe(7);
      expect((await first.api.post(`${root}/exercises/${block.id}/attempts`, { data: { ...data, requestId: randomUUID(), expectedAttempt: 2 } })).status()).toBe(422);
    });
    const where = { organizationId: f.org.id, userId: first.id };
    const before = await f.db.progress.findFirstOrThrow({ where });
    const result = await f.db.assessmentAttempt.findFirstOrThrow({ where: { ...where, countsTowardResults: true } });
    draft = await f.draft(); const updated = writable(draft); updated.chapters[0]!.blocks[0]!.content = { runs: [{ text: 'Acceptance content v2' }] }; await f.save(updated);
    await authorPage.reload(); await authorPage.getByRole('button', { name: 'Опубликовать версию', exact: true }).click();
    await expect(authorPage.getByRole('status').filter({ hasText: 'Опубликована версия 2.' })).toBeVisible();
    await complete(second, 2);
    await test.step('v1 result, completion date and certificate remain unchanged after v2', async () => {
      const pinned = await json<LongreadReaderDocument>(first.api.get(`${root}/published`)); expect(pinned.version).toBe(1);
      expect(pinned.completion).toEqual(old.completion);
      expect(await f.db.progress.findFirstOrThrow({ where })).toMatchObject({ score: before.score, status: before.status, completedAt: before.completedAt, longreadRevisionId: before.longreadRevisionId });
      expect(await f.db.assessmentAttempt.findUniqueOrThrow({ where: { id: result.id } })).toEqual(result);
      expect(await f.db.certificate.count({ where })).toBe(1);
      const report = await json<{ progress: { user: { id: string }; longread?: unknown }[] }>(author.api.get('/api/v1/reports/summary'));
      expect(report.progress.find((p) => p.user.id === first.id)?.longread).toEqual(pinned.completion);
    });
  } finally { await f.cleanup(); }
});

test('real longread performance: 100 blocks and 20 large attachment descriptors stay bounded', async ({ browser, baseURL }) => {
  test.setTimeout(60_000); const f = await acceptanceFixture(browser, baseURL!);
  try {
    const draft = await f.draft();
    const saved = await f.save({ ...writable(draft), chapters: [{ id: draft.chapters[0]!.id, title: '100 blocks', hidden: false, blocks: [
      ...Array.from({ length: 99 }, (_, i) => ({ type: 'paragraph', content: { runs: [{ text: `Block ${i}` }] } })),
      { type: 'attachments', content: { files: f.files.map(({ id }, i) => ({ fileId: id, label: `guide-${i}.pdf` })) } },
    ] }] });
    await json(f.author.api.post(`${f.root}/publish`, { data: { revision: saved.revision } }));
    const started = performance.now(); const response = await f.first.api.get(`${f.root}/published`); const bytes = await response.body();
    const data = await json<LongreadReaderDocument>(response);
    expect(data.chapters[0]!.blocks).toHaveLength(100); expect(bytes.length).toBeLessThan(100_000); expect(performance.now() - started).toBeLessThan(10_000);
    const page = await f.first.context.newPage(); await page.goto(`/learn/lessons/${f.lesson.id}`); await expect(page.getByText('Block 98', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /guide-\d+\.pdf/ })).toHaveCount(20);
  } finally { await f.cleanup(); }
});
