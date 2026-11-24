import { randomUUID, scryptSync } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';
import { json } from '../fixtures/longread-acceptance.js';

const types = ['Один вариант', 'Несколько вариантов', 'Верно / Неверно', 'Соответствие', 'Порядок', 'Заполнение пропусков', 'Короткий ответ'];
const imageUrl = '/favicon.svg';

async function fillQuiz(page: Page, checkAccessibility = false) {
  await expect(page.getByRole('heading', { name: 'Вопрос 1', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Вопрос 1' })).toHaveAttribute('src', imageUrl);
  await expect(page.locator('.learner-quiz__options img')).toHaveAttribute('src', imageUrl);
  const next = () => page.getByRole('button', { name: /Следующий вопрос/ }).click();
  await page.getByRole('radio', { name: 'Ответ 1' }).check();
  await next();
  await page.getByRole('checkbox', { name: 'Ответ 2' }).check();
  await next();
  await page.getByRole('radio', { name: 'Неверно', exact: true }).check();
  await next();
  await page.getByLabel('Слева 1').selectOption({ label: 'Справа 1' });
  await page.getByLabel('Слева 2').selectOption({ label: 'Справа 2' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  if (checkAccessibility) {
    const scan = await new AxeBuilder({ page }).include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  }
  await next();
  await page.getByLabel('Позиция 1').selectOption({ label: 'Первый шаг' });
  await page.getByLabel('Позиция 2').selectOption({ label: 'Второй шаг' });
  await next();
  await page.getByRole('textbox', { name: /Пропуск 1/ }).fill('Алматы');
  await next();
  await page.getByRole('textbox', { name: 'Короткий ответ' }).fill('Café');
  await page.getByRole('button', { name: 'Отправить ответы', exact: true }).click();
  await expect(page.locator('.learner-quiz__result-score')).toContainText('100%');
}

test('authors, previews and grades all seven assessment question types', async ({ request, browser, baseURL }) => {
  test.setTimeout(60_000);
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'test' || !/(?:^|[_-])test(?:$|[_-])/.test(database.pathname.slice(1))
    || !['localhost', '127.0.0.1', ...(process.env.CI ? ['postgres'] : [])].includes(database.hostname)) {
    throw new Error('Assessment questions E2E requires a disposable test database');
  }

  const db = new PrismaClient();
  const org = await db.organization.create({ data: { name: 'Question types E2E', slug: `test-${randomUUID()}` } });
  const organizationId = org.id;
  const password = 'AssessmentTypes528!';
  async function login(role: 'admin' | 'learner') {
    const salt = randomUUID();
    const actor = await db.user.create({ data: {
      organizationId, email: `${randomUUID()}@example.test`, firstName: 'Assessment', lastName: role, locale: 'ru',
      passwordHash: `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
      memberships: { create: { organizationId, role } },
    } });
    const { accessToken } = await json<{ accessToken: string }>(request.post('/api/v1/auth/login', {
      data: { organizationId, email: actor.email, password },
    }));
    const context = await browser.newContext({ baseURL, storageState: await request.storageState(), viewport: { width: 375, height: 900 } });
    return { actor, context, headers: { Authorization: `Bearer ${accessToken}` } };
  }

  try {
    const author = await login('admin');
    try {
      const { id } = await json<{ id: string }>(request.post('/api/v1/assessments', {
        headers: author.headers, data: { organizationId, title: 'Семь типов вопросов', slug: 'seven-types' },
      }));
      const endpoint = `/api/v1/assessments/${id}`;
      const page = await author.context.newPage();
      await page.goto(`/admin/assessments/${id}/edit`);
      const editor = page.getByTestId('assessment-editor-questions');
      const questions = editor.locator(':scope > ol > li');
      for (const [index, type] of types.entries()) {
        await editor.getByRole('button', { name: `+ ${type}`, exact: true }).click();
        const question = questions.nth(index);
        await question.getByLabel(/^Название вопроса/).fill(`Вопрос ${index + 1}`);
        if (index < 2) {
          await question.getByRole('button', { name: 'Добавить вариант' }).click();
          await question.getByLabel('Текст варианта', { exact: true }).fill(`Ответ ${index + 1}`);
          await question.getByLabel('Верный', { exact: true }).check();
          if (index === 0) {
            await question.getByLabel('Ссылка на изображение вопроса').fill(imageUrl);
            await question.getByLabel('Ссылка на изображение варианта').fill(imageUrl);
          } else {
            await question.getByLabel('Начисление баллов').selectOption('per_option');
          }
        } else if (index === 2) {
          await question.getByRole('combobox', { name: 'Правильный ответ', exact: true }).selectOption('false');
        } else if (index === 3) {
          for (const number of [1, 2]) {
            await question.getByLabel('Левый элемент').nth(number - 1).fill(`Слева ${number}`);
            await question.getByLabel('Правый элемент').nth(number - 1).fill(`Справа ${number}`);
          }
        } else if (index === 4) {
          await question.getByLabel('Элемент', { exact: true }).first().fill('Первый шаг');
          await question.getByLabel('Элемент', { exact: true }).last().fill('Второй шаг');
        } else {
          await question.getByLabel(/Допустимые ответы/).fill(index === 5 ? 'Алматы' : 'Café\nКафе');
          if (index === 6) await question.getByLabel('Учитывать регистр').check();
        }
      }

      await page.getByRole('button', { name: 'Предпросмотр с начала' }).click();
      await fillQuiz(page);
      expect(await db.assessmentAttempt.count({ where: { assessmentId: id } })).toBe(0);
      await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
      await expect(page.getByText('Опубликован', { exact: true })).toBeVisible();

      const learner = await login('learner');
      try {
        await json(request.post(`${endpoint}/standalone/assignments`, {
          headers: author.headers, data: { target: 'user', targetId: learner.actor.id, dueAt: new Date(Date.now() + 86_400_000).toISOString() },
        }));
        const takingPage = await learner.context.newPage();
        await takingPage.goto(`/learn/assessments/${id}/take`);
        await fillQuiz(takingPage, true);
        const recorded = await db.assessmentAttempt.findFirstOrThrow({
          where: { assessmentId: id, userId: learner.actor.id }, include: { answers: true },
        });
        expect(recorded.answers).toHaveLength(7);
        expect(recorded.answers.every((answer) => answer.isCorrect)).toBe(true);
        expect(recorded.answers.filter((answer) => answer.response !== null)).toHaveLength(5);
      } finally {
        await learner.context.close();
      }
    } finally {
      await author.context.close();
    }
  } finally {
    await db.assessmentAttemptAnswer.deleteMany({ where: { organizationId } });
    await db.assessmentAttempt.deleteMany({ where: { organizationId } });
    await db.user.deleteMany({ where: { organizationId } });
    await db.organization.delete({ where: { id: organizationId } });
    await db.$disconnect();
  }
});
