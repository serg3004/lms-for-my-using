import { randomUUID, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { json } from '../fixtures/longread-acceptance.js';

test('assign a standalone test and take it by link after signing in', async ({ page, request, browser, baseURL }) => {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'test' || !/(?:^|[_-])test(?:$|[_-])/.test(database.pathname.slice(1))
    || !['localhost', '127.0.0.1', ...(process.env.CI ? ['postgres'] : [])].includes(database.hostname)) {
    throw new Error('Standalone assessment E2E requires a disposable test database');
  }

  const prisma = new PrismaClient();
  const organization = await prisma.organization.create({ data: { name: 'Assessment E2E', slug: `test-${randomUUID()}` } });
  const organizationId = organization.id;
  const password = 'AssessmentTest523!';
  try {
    async function addUser(role: 'admin' | 'learner') {
      const salt = randomUUID();
      const user = await prisma.user.create({
        data: {
          organizationId, email: `${randomUUID()}@example.test`, firstName: 'Assessment', lastName: role,
          locale: 'ru', passwordHash: `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
        },
      });
      await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
      return user;
    }
    const admin = await addUser('admin');
    const employee = await addUser('learner');
    const { accessToken } = await json<{ accessToken: string }>(request.post('/api/v1/auth/login', {
      data: { organizationId, email: admin.email, password },
    }));
    const headers = { Authorization: `Bearer ${accessToken}` };
    const { id } = await json<{ id: string }>(request.post('/api/v1/assessments', {
      headers, data: { organizationId, title: 'Самостоятельная проверка', slug: 'standalone-e2e' },
    }));
    const path = `/api/v1/assessments/${id}`;
    const question = await json<{ id: string }>(request.post(`${path}/questions`, { headers, data: { organizationId, title: 'Вопрос' } }));
    for (const [text, isCorrect] of [['Правильный ответ', true], ['Неправильный ответ', false]] as const) {
      await json(request.post(`/api/v1/questions/${question.id}/options`, { headers, data: { organizationId, text, isCorrect } }));
    }
    await json(request.patch(`${path}/status`, { headers, data: { status: 'published' } }));
    const authorPage = await browser.newPage({ baseURL, storageState: await request.storageState() });
    let shareUrl: URL;
    try {
      await authorPage.goto('/admin/assessments');
      const row = authorPage.getByRole('row').filter({ hasText: 'Самостоятельная проверка' });
      await row.getByRole('button', { name: 'Назначения и ссылка' }).click();
      const dialog = authorPage.getByRole('dialog');
      await dialog.getByLabel('Получатель').selectOption(employee.id);
      const deadline = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
      await dialog.getByLabel('Срок', { exact: true }).fill(deadline);
      await dialog.getByRole('button', { name: 'Назначить', exact: true }).click();
      await expect(dialog.getByRole('status')).toHaveText('Назначено сотрудникам: 1');
      await dialog.getByRole('button', { name: 'Создать новую ссылку' }).click();
      await expect(dialog.getByRole('img', { name: 'Скачать QR-код' })).toBeVisible();
      shareUrl = new URL(await dialog.getByLabel('Ссылка на тест', { exact: true }).inputValue());
    } finally {
      await authorPage.close();
    }
    await page.goto(shareUrl.href);
    await expect(page).toHaveURL(/\/login$/);
    await page.locator('input[name="organizationId"]').fill(organizationId);
    await page.locator('input[name="email"]').fill(employee.email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(shareUrl.href);
    await page.getByRole('radio', { name: 'Правильный ответ', exact: true }).check();
    await page.getByRole('button', { name: 'Отправить ответы', exact: true }).click();
    await expect(page.getByText('100%', { exact: true }).first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/learn/assessments');
    await expect(page.getByText('Самостоятельная проверка', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Срок:/)).toBeVisible();
    const results = await json<unknown[]>(request.get(`${path}/results?placementId=standalone`, { headers }));
    expect(results).toMatchObject([{ userId: employee.id, passed: true, courseId: null }]);
  } finally {
    await prisma.assessmentAttempt.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }
});
