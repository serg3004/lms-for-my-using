import { expect, type Page } from '@playwright/test';
import { longreadCourseId, longreadEditorServer, longreadLessonId } from './longread-editor.js';

/** Synthetic author journey; the API's organization/role enforcement is covered by database tests. */
export async function openLongreadEntrypoints(page: Page, options: { enabled?: boolean; locale?: 'ru' | 'en' | 'kk' | 'zh'; role?: 'admin' | 'manager'; path?: string } = {}) {
  let enabled = options.enabled ?? false, failRead = false, failSave = false;
  const writes: Record<string, unknown>[] = [];
  const changes: boolean[] = [];
  const course = { id: longreadCourseId, organizationId: 'org', title: 'Безопасность', slug: 'safety', description: '', status: 'draft', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', _count: { lessons: 1 } };
  const lesson = { id: longreadLessonId, courseId: longreadCourseId, organizationId: 'org', title: 'Безопасная работа', slug: 'safe-work', type: 'longread', order: 0, status: 'draft', description: '', course: { title: course.title } };
  const editor = longreadEditorServer();
  await editor.attach(page, { locale: options.locale, beforeNavigate: async () => {
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      const method = route.request().method();
      if (options.role === 'manager' && path === '/auth/me') return route.fulfill({ json: { id: 'manager', organizationId: 'org', email: 'manager@example.invalid', firstName: 'Manager', roles: ['manager'], locale: options.locale ?? 'ru', timezone: 'UTC', status: 'active' } });
      if (path.endsWith('/features')) {
        if (method === 'PATCH') {
          if (failSave) { failSave = false; return route.fulfill({ status: 503, json: { message: 'Synthetic save failure' } }); }
          enabled = route.request().postDataJSON().longreadEnabled;
          changes.push(enabled);
        } else if (failRead) { return route.fulfill({ status: 503, json: { message: 'Synthetic read failure' } }); }
        return route.fulfill({ json: { longreadEnabled: enabled } });
      }
      if (path === '/courses') return route.fulfill({ json: { items: [course], page: 1, pageSize: 20, total: 1 } });
      if (path === `/courses/${longreadCourseId}`) return route.fulfill({ json: course });
      if (path === `/courses/${longreadCourseId}/lessons`) {
        if (method === 'POST') { writes.push(route.request().postDataJSON()); return route.fulfill({ json: lesson }); }
        return route.fulfill({ json: enabled ? [lesson] : [] });
      }
      if (path === '/lessons') return route.fulfill({ json: { items: enabled ? [lesson] : [], total: enabled ? 1 : 0 } });
      return route.fallback();
    });
  } });
  await page.goto(options.path ?? '/admin/courses');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  return { editor, writes, changes, failRead: () => { failRead = true; }, recoverRead: () => { failRead = false; }, failSave: () => { failSave = true; } };
}
