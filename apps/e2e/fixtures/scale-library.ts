import { expect, type Page } from '@playwright/test';
import type { ChecklistScaleSummary } from '../../web/src/shared/api/types.js';
export const libraryScale = (overrides: Partial<ChecklistScaleSummary> = {}): ChecklistScaleSummary => ({
  id: 'quality', organizationId: 'scales-org', name: 'Качество обслуживания', status: 'active', isDefault: false, inUse: false,
  createdBy: 'author', createdAt: '2026-01-15T12:00:00Z', creator: { id: 'author', firstName: 'Анна', lastName: 'Автор' }, usageCount: 0, usedByChecklists: [],
  levels: [{ value: 1, label: 'Не выполнено', score: 0, color: '#C62828' }, { value: 2, label: 'Выполнено', score: 100, color: '#2E7D32' }], ...overrides,
});
export function scaleLibraryServer(options: { role?: 'admin' | 'manager' | 'instructor' | 'mentor'; locale?: 'ru' | 'en' | 'kk' | 'zh'; empty?: boolean } = {}) {
  const role = options.role ?? 'admin', locale = options.locale ?? 'ru';
  const base = role === 'instructor' ? '/instructor/checklists/scales' : role === 'mentor' ? '/mentor/scales' : '/admin/checklists/scales';
  const scales = options.empty ? [] : [libraryScale({ id: 'system', name: 'Да / Нет', isDefault: true, createdBy: null, creator: null }), libraryScale({ usageCount: 1, inUse: true, usedByChecklists: [{ id: 'sheet', title: 'Открытие смены' }] }), libraryScale({ id: 'unused', name: 'Навыки' })];
  const writes: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
  let failure = 0, failuresLeft = 0;
  return { base, scales, writes, fail: (status: number, times = 1) => { failure = status; failuresLeft = times; },
    attach: async (page: Page, suffix = '') => {
      await page.route('**/api/v1/**', async (route) => {
        const path = new URL(route.request().url()).pathname.replace('/api/v1', ''), method = route.request().method();
        if (path === '/auth/me') return route.fulfill({ json: { id: 'viewer', organizationId: 'scales-org', firstName: 'Анна', lastName: 'Автор', email: 'viewer@example.invalid', roles: [role], locale, timezone: 'UTC', status: 'active' } });
        if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
        if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
        if (!path.startsWith('/checklist-scales')) return route.fulfill({ json: { items: [], total: 0 } });
        if (failuresLeft > 0) { const status = failure; failuresLeft--; return route.fulfill({ status, json: { message: 'Synthetic scale failure' } }); }
        const [, , id, action] = path.split('/');
        const found = scales.find((scale) => scale.id === id);
        if (method === 'GET') return id ? found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { message: 'Not found' } }) : route.fulfill({ json: scales });
        const body = route.request().postData() ? route.request().postDataJSON() as Record<string, unknown> : null; writes.push({ method, path, body });
        if (role === 'instructor' || role === 'mentor') return route.fulfill({ status: 403, json: { message: 'Read only' } });
        if (method === 'POST' && !id) { const scale = libraryScale({ id: `new-${writes.length}`, ...body }); scales.push(scale); return route.fulfill({ json: scale }); }
        if (!found) return route.fulfill({ status: 404, json: { message: 'Not found' } });
        if (action === 'copy') { const copy = libraryScale({ ...found, id: `copy-${writes.length}`, name: String(body?.name), isDefault: false, inUse: false, usageCount: 0, usedByChecklists: [] }); scales.push(copy); return route.fulfill({ json: copy }); }
        if (found.isDefault) return route.fulfill({ status: 400, json: { message: 'Protected scale' } });
        if (method === 'DELETE') { if (found.usageCount) return route.fulfill({ status: 409, json: { message: 'In use' } }); scales.splice(scales.indexOf(found), 1); return route.fulfill({ status: 204 }); }
        if (action === 'archive') { found.status = 'archived'; return route.fulfill({ json: found }); }
        if (method === 'PATCH') { Object.assign(found, body); return route.fulfill({ json: found }); }
        return route.fulfill({ status: 400, json: { message: 'Unexpected write' } });
      });
      await page.goto(`${base}${suffix}`); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  };
}
