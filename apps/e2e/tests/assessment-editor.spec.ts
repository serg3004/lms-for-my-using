import { randomUUID, scryptSync } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { json } from '../fixtures/longread-acceptance.js';

test('creates, reorders, previews and publishes a test without exposing saved drafts', async ({ request, browser, baseURL }) => {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'test' || !/(?:^|[_-])test(?:$|[_-])/.test(database.pathname.slice(1))
    || !['localhost', '127.0.0.1', ...(process.env.CI ? ['postgres'] : [])].includes(database.hostname)) {
    throw new Error('Assessment editor E2E requires a disposable test database');
  }

  const prisma = new PrismaClient();
  const organization = await prisma.organization.create({ data: { name: 'Assessment editor E2E', slug: `test-${randomUUID()}` } });
  const organizationId = organization.id;
  const password = 'AssessmentEditor527!';
  const salt = randomUUID();
  const email = `${randomUUID()}@example.test`;
  try {
    const admin = await prisma.user.create({ data: {
      organizationId, email, firstName: 'Assessment', lastName: 'Editor', locale: 'ru',
      passwordHash: `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
      memberships: { create: { organizationId, role: 'admin' } },
    } });
    const { accessToken } = await json<{ accessToken: string }>(request.post('/api/v1/auth/login', {
      data: { organizationId, email: admin.email, password },
    }));
    const headers = { Authorization: `Bearer ${accessToken}` };
    const employee = await prisma.user.create({ data: {
      organizationId, email: `${randomUUID()}@example.test`, firstName: 'Test', lastName: 'Employee',
      passwordHash: `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
      memberships: { create: { organizationId, role: 'learner' } },
    } });
    const context = await browser.newContext({ baseURL, storageState: await request.storageState() });
    const page = await context.newPage();
    try {
      await page.goto('/admin/assessments/new');
      await page.getByRole('checkbox', { name: /самостоятельный тест/i }).waitFor();
      await page.getByRole('textbox', { name: /^Название/ }).fill('Проверка знаний');
      await page.getByLabel('Лимит времени (минуты)').fill('12');
      await page.setViewportSize({ width: 375, height: 900 });
      await page.getByRole('button', { name: 'Настройки', exact: true }).click();
      await page.getByLabel('Какая попытка считается').selectOption('best');
      await page.getByLabel('Показывать обратную связь').check();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      const settingsScan = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(settingsScan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
      await page.getByRole('button', { name: 'Основное', exact: true }).click();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator('button[form="assessment-editor-create"]').click();
      await expect(page.getByRole('button', { name: '+ Один вариант', exact: true })).toBeVisible();
      const id = new URL(page.url()).pathname.split('/')[3];
      const endpoint = `/api/v1/assessments/${id}`;
      await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();

      const questions = page.getByTestId('assessment-editor-questions').locator(':scope > ol > li');
      await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ body: 'Video fixture' }));
      for (const [index, title] of ['Первый вопрос', 'Второй вопрос'].entries()) {
        await page.getByRole('button', { name: '+ Один вариант', exact: true }).click();
        const question = questions.nth(index);
        await question.getByRole('textbox').first().fill(title);
        await question.getByRole('button', { name: 'Добавить вариант', exact: true }).click();
        await question.getByLabel('Текст варианта', { exact: true }).fill(`Ответ ${index + 1}`);
        await question.getByRole('radio', { name: 'Верный' }).check();
        if (index === 0) {
          await question.locator('summary').filter({ hasText: 'Материал' }).first().click();
          const material = question.locator('details[open]');
          await material.getByLabel('Ссылка HTTPS или код встраивания').fill('https://youtu.be/dQw4w9WgXcQ');
          await material.getByLabel('Название для экранного диктора').fill('Видео к первому вопросу');
          await material.getByRole('button', { name: 'Применить источник', exact: true }).click();
        }
      }
      await questions.nth(1).getByRole('button', { name: 'Переместить элемент 2 вверх' }).click();
      await expect(questions.first().getByRole('textbox').first()).toHaveValue('Второй вопрос');
      await questions.nth(1).getByRole('button', { name: 'С этого вопроса' }).click();
      await expect(page.getByRole('heading', { name: 'Первый вопрос' })).toBeVisible();
      await page.setViewportSize({ width: 360, height: 900 });
      await expect(page.locator('iframe[title="Видео к первому вопросу"]')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      await page.getByRole('radio', { name: 'Ответ 1' }).check();
      await page.getByRole('button', { name: 'Отправить ответы', exact: true }).click();
      await expect(page.locator('.learner-quiz__result-score')).toContainText('100%');
      await expect(page.locator('.learner-quiz__breakdown iframe[title="Видео к первому вопросу"]')).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole('button', { name: 'Предпросмотр с начала' }).click();
      await expect(page.getByRole('heading', { name: 'Второй вопрос' })).toBeVisible();
      await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
      await expect(page.getByText('Опубликован', { exact: true })).toBeVisible();
      await json(request.post(`${endpoint}/standalone/assignments`, {
        headers, data: { target: 'user', targetId: employee.id, dueAt: new Date(Date.now() + 86_400_000).toISOString() },
      }));
      const learnerLogin = await json<{ accessToken: string }>(request.post('/api/v1/auth/login', {
        data: { organizationId, email: employee.email, password },
      }));
      const learnerHeaders = { Authorization: `Bearer ${learnerLogin.accessToken}` };
      const started = await json<{ id: string; questions: { id: string; options: { id: string }[] }[] }>(
        request.post(`${endpoint}/attempts/start?draft=true`, { headers: learnerHeaders }),
      );
      await json(request.post(`${endpoint}/attempts`, {
        headers: learnerHeaders,
        data: { attemptId: started.id, answers: started.questions.map((item) => ({ questionId: item.id, selectedOptionId: item.options[0]!.id })) },
      }));
      const published = await json<{ title: string }[]>(request.get(`${endpoint}/quiz`, { headers: learnerHeaders }));
      expect(published[1]).toMatchObject({ material: expect.stringContaining('dQw4w9WgXcQ') });
      expect(published.map((question) => question.title)).toEqual(['Второй вопрос', 'Первый вопрос']);
      expect(await json(request.get(endpoint, { headers }))).toMatchObject({ status: 'published', timeLimitMinutes: 12, policy: { attemptPolicy: 'best', showFeedback: true } });

      await page.getByRole('button', { name: 'Вопросы', exact: true }).click();
      await questions.first().getByRole('button', { name: 'Редактировать' }).click();
      await questions.first().getByRole('textbox').first().fill('Изменённый вопрос');
      await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
      const confirmation = page.getByRole('dialog');
      await expect(confirmation).toContainText('Test Employee');
      await expect(confirmation).toContainText('У теста есть попытки');
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const bounds = await confirmation.boundingBox();
        expect(bounds?.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      }
      await page.getByRole('button', { name: 'Подтвердить изменения', exact: true }).click();
      await expect(page.getByText('Неопубликованные изменения', { exact: true })).toBeVisible();
      expect(await json(request.get(`${endpoint}/quiz`, { headers: learnerHeaders }))).toMatchObject(published);
      await page.reload();
      await page.getByRole('button', { name: 'Вопросы', exact: true }).click();
      await expect(questions.first()).toContainText('Изменённый вопрос');
      const copy = await json<{ id: string }>(request.post(`${endpoint}/copy`, { headers }));
      expect(await json(request.get(`/api/v1/assessments/${copy.id}/questions`, { headers }))).toMatchObject([{ title: 'Изменённый вопрос' }, { title: 'Первый вопрос' }]);
      expect(await prisma.assessmentAttempt.count({ where: { assessmentId: copy.id } })).toBe(0);

      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      const scan = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);

      await page.getByRole('button', { name: 'Вернуть в черновики' }).click();
      await page.getByRole('button', { name: 'Подтвердить изменения', exact: true }).click();
      await expect(page.getByText('Черновик', { exact: true })).toBeVisible();
      expect(await json(request.get(endpoint, { headers }))).toMatchObject({ status: 'draft' });
    } finally {
      await context.close();
    }
  } finally {
    await prisma.assessmentAttempt.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }
});
