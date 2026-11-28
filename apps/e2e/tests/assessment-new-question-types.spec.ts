import { expect, test, type Page } from '@playwright/test';
import { openTypedAssessment, typedAssessmentId } from '../fixtures/assessment-typed-compat.js';

// PR 539: image drop and card sort, played in the author preview (no attempt is written).
const background = JSON.stringify({ kind: 'file', fileId: '11111111-1111-4111-8111-111111111111.png', caption: '', alt: 'Схема цеха' });
const imageDrop = { type: 'image_drop', background, objects: [{ id: 'o1', text: 'Клапан' }, { id: 'o2', text: 'Манометр' }],
  zones: [{ id: 'z1', shape: 'rect', x: 5, y: 5, width: 25, height: 20 }, { id: 'z2', shape: 'polygon', x: 55, y: 50, width: 25, height: 25, points: [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }],
  correctPairs: [{ zoneId: 'z1', objectId: 'o1' }, { zoneId: 'z2', objectId: 'o2' }] };
const cardSort = { type: 'card_sort', categories: [{ id: 'k1', text: 'Безопасно' }, { id: 'k2', text: 'Опасно' }], cards: [{ id: 'c1', text: 'Каска' }, { id: 'c2', text: 'Оголённый провод' }],
  correctPlacements: [{ cardId: 'c1', categoryId: 'k1' }, { cardId: 'c2', categoryId: 'k2' }] };

async function preview(page: Page, type: string, custom: Record<string, unknown>) {
  await openTypedAssessment(page, { role: 'admin', type, custom });
  await page.goto(`/admin/assessments/${typedAssessmentId}/edit?tab=questions`);
  const questions = page.getByTestId('assessment-editor-questions');
  await questions.getByRole('button', { name: 'Редактировать' }).click();
  return questions;
}
async function startPreview(page: Page, questions: ReturnType<Page['getByTestId']>) {
  await questions.getByRole('button', { name: 'С этого вопроса' }).click();
  await expect(page.locator('.learner-quiz__question')).toBeVisible();
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('image drop: the author sees zone fields and the learner can answer with the keyboard lists or a click', async ({ page }) => {
  const questions = await preview(page, 'image_drop', imageDrop);
  await expect(questions.getByText('Область 2').first()).toBeVisible();
  await expect(questions.getByLabel('Область 1: Слева, %')).toHaveValue('5');
  await expect(questions.getByLabel('Область 2: Ширина, %')).toHaveValue('25');
  await expect(questions.getByLabel('Область 2: Точка 3: сверху, %')).toHaveValue('100');
  await startPreview(page, questions);
  const quiz = page.locator('.learner-quiz__question');
  // Keyboard / screen reader path: a labelled list for every zone.
  await quiz.getByLabel('Объект для области 1').selectOption({ label: 'Клапан' });
  await expect(quiz.getByRole('button', { name: 'Область 1: Клапан' })).toBeVisible();
  // Pointer path: pick an object, then press the zone.
  await quiz.getByRole('button', { name: 'Манометр', exact: true }).click();
  await expect(quiz.getByRole('button', { name: 'Манометр', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await quiz.getByRole('button', { name: 'Область 2: пусто' }).click();
  await expect(quiz.getByLabel('Объект для области 2')).toHaveValue('o2');
  await quiz.getByRole('button', { name: 'Расставить заново' }).click();
  await expect(quiz.getByRole('button', { name: 'Область 1: пусто' })).toBeVisible();
});

test('card sort: cards are sorted from the list of each card and reset', async ({ page }) => {
  const questions = await preview(page, 'card_sort', cardSort);
  await expect(questions.getByLabel('Категория 1', { exact: true })).toHaveValue('Безопасно');
  await startPreview(page, questions);
  const quiz = page.locator('.learner-quiz__question');
  await quiz.getByLabel('Категория для карточки «Каска»').selectOption({ label: 'Безопасно' });
  await expect(quiz.locator('section', { has: page.getByRole('heading', { name: 'Безопасно' }) }).getByText('Каска')).toBeVisible();
  await expect(quiz.locator('section', { has: page.getByRole('heading', { name: 'Не распределены' }) }).getByText('Оголённый провод')).toBeVisible();
  await quiz.getByRole('button', { name: 'Расставить заново' }).click();
  await expect(quiz.locator('section', { has: page.getByRole('heading', { name: 'Не распределены' }) }).getByText('Каска')).toBeVisible();
});

for (const [type, definition] of [['image_drop', imageDrop], ['card_sort', cardSort]] as const) test(`${type} fits a 360 px phone without horizontal scroll`, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const questions = await preview(page, type, definition);
  await startPreview(page, questions);
  await expect(page.locator('.learner-quiz__question select').first()).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
});
