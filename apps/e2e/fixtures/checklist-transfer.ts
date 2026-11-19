import type { Page } from '@playwright/test';

// PR 477: mocks of the hand-over of a check, shared by the e2e, accessibility and visual tests.
const item = { id: 'i1', checklistId: 'c1', order: 1, text: 'Проверить кассу', points: 10, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false, scaleId: null, groupId: null, scale: null };
const sheet = { id: 'c1', title: 'Приёмка товара', description: null, showPointsToLearner: false, scoringMode: 'sum_points', scaleLevels: null, requiresReview: false, passThreshold: 70, forbidGalleryPhotos: false, allowFinishIncomplete: false, contextFields: [], itemGroups: [], items: [item] };
const instance = (userId: string) => ({
  id: 'inst1', organizationId: 'org', checklistId: 'c1', userId, assignedBy: null, reviewerId: null, status: 'in_progress', totalScore: 0, maxScore: 10, percentage: 0, passed: false, scored: true,
  dueAt: null, createdAt: '2026-11-19T08:00:00.000Z', updatedAt: '2026-11-19T09:00:00.000Z', checklist: sheet, results: [],
});
const me = (id: string, firstName: string, lastName: string) => ({ id, organizationId: 'org', email: `${id}@example.invalid`, firstName, lastName, roles: ['learner'], status: 'active', locale: 'ru', timezone: 'UTC' });

export type TransferState = { transferred: boolean; bodies: unknown[]; candidates: Array<{ id: string; firstName: string; lastName: string }>; transferStatus: number };

export async function installTransferMocks(page: Page, viewer: 'executor' | 'colleague', state: TransferState) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const method = route.request().method();
    if (path === '/auth/me') return route.fulfill({ json: viewer === 'executor' ? me('lena', 'Лена', 'Лернер') : me('anna', 'Анна', 'Иванова') });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists/free') return route.fulfill({ json: [] });
    if (path === '/checklist-instances/mine') return route.fulfill({ json: viewer === 'executor' ? (state.transferred ? [] : [instance('lena')]) : [instance('anna')] });
    if (path === '/checklist-instances/transferred-from-me') {
      return route.fulfill({ json: viewer === 'executor' && state.transferred ? [{ id: 'inst1', checklistId: 'c1', title: 'Приёмка товара', status: 'in_progress', transferredAt: '2026-11-19T09:05:00.000Z', toUser: { id: 'anna', firstName: 'Анна', lastName: 'Иванова' } }] : [] });
    }
    if (path === '/checklist-instances/inst1/transfer-candidates') return route.fulfill({ json: state.candidates });
    if (path === '/checklist-instances/inst1/transfers') {
      return route.fulfill({ json: viewer === 'colleague' ? [{ id: 'e1', at: '2026-11-19T09:05:00.000Z', note: 'Склад закрывается в 18:00', from: { id: 'lena', firstName: 'Лена', lastName: 'Лернер' }, to: { id: 'anna', firstName: 'Анна', lastName: 'Иванова' } }] : [] });
    }
    if (path === '/checklist-instances/inst1/transfer' && method === 'POST') {
      state.bodies.push(route.request().postDataJSON());
      if (state.transferStatus !== 200) return route.fulfill({ status: state.transferStatus, json: { code: 'CONFLICT', message: 'The check was changed in the meantime', details: [] } });
      state.transferred = true;
      return route.fulfill({ json: { id: 'inst1', userId: 'anna' } });
    }
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
  });
}
export const freshTransferState = (): TransferState => ({ transferred: false, bodies: [], candidates: [{ id: 'anna', firstName: 'Анна', lastName: 'Иванова' }, { id: 'boris', firstName: 'Борис', lastName: 'Петров' }], transferStatus: 200 });

/** Opens the first check of the executor and the hand-over window. */
export async function openTransferDialog(page: Page) {
  await page.goto('/learn/checklists');
  await page.getByText('Приёмка товара').click();
  await page.getByRole('button', { name: 'Передать проверку…' }).click();
  await page.getByRole('dialog', { name: 'Передать проверку коллеге' }).waitFor();
}
