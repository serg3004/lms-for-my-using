// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listChecklists: vi.fn(),
  createChecklist: vi.fn(),
  getChecklist: vi.fn(),
  deleteChecklist: vi.fn(),
  updateChecklist: vi.fn(),
  copyChecklist: vi.fn(),
  listInstancesForChecklist: vi.fn(),
  listChecklistItemGroups: vi.fn(),
  listChecklistScales: vi.fn(),
}));
vi.mock('../shared/api/checklists.js', () => api);
vi.mock('../shared/api/users.js', () => ({ listUsers: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 200, total: 0 }) }));
vi.mock('../shared/session.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/session.js')>()),
  useSession: () => ({ currentUser: { id: 'admin-1', organizationId: 'org-1', role: 'admin', firstName: 'A', lastName: 'B', email: 'a@example.invalid' } }),
  useOptionalSession: () => null,
}));

import { AdminChecklistsPage } from './AdminChecklistsPage';

const DEFAULT_TITLE = 'Новый чек-лист';
const draft = (overrides = {}) => ({
  id: 'draft-1', organizationId: 'org-1', title: DEFAULT_TITLE, description: null, status: 'draft', scoringMode: 'sum_points',
  passThreshold: 80, requiresReview: false, createdBy: 'admin-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  items: [], itemGroups: [], contextFields: [], ...overrides,
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }),
});

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  // Unmounting runs the best-effort draft cleanup; let it settle so it cannot leak into the next test.
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  vi.clearAllMocks();
});

async function openNewDraft(fresh: ReturnType<typeof draft>) {
  api.listChecklists.mockResolvedValueOnce([]).mockResolvedValue([fresh]);
  api.createChecklist.mockResolvedValue(fresh);
  api.getChecklist.mockResolvedValue(fresh);
  api.listInstancesForChecklist.mockResolvedValue([]);
  api.listChecklistItemGroups.mockResolvedValue([]);
  api.listChecklistScales.mockResolvedValue([]);
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<MemoryRouter><AdminChecklistsPage /></MemoryRouter>); });
  const create = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Создать чек-лист'));
  await act(async () => { create?.click(); });
  return container;
}

describe('AdminChecklistsPage new draft (PR 338)', () => {
  it('discards the draft when the author goes back without entering anything', async () => {
    const container = await openNewDraft(draft());
    const back = container.querySelector<HTMLButtonElement>('.admin-back-link');
    expect(back).not.toBeNull();
    await act(async () => { back?.click(); });
    expect(api.deleteChecklist).toHaveBeenCalledWith('draft-1');
  });

  it('keeps the draft when something was entered', async () => {
    const container = await openNewDraft(draft());
    api.getChecklist.mockResolvedValue(draft({ title: 'Касса' }));
    const back = container.querySelector<HTMLButtonElement>('.admin-back-link');
    expect(back).not.toBeNull();
    await act(async () => { back?.click(); });
    expect(api.getChecklist).toHaveBeenCalledWith('draft-1');
    expect(api.deleteChecklist).not.toHaveBeenCalled();
  });

  it('discards an untouched draft when the page is left', async () => {
    await openNewDraft(draft());
    await act(async () => { root?.unmount(); });
    root = undefined;
    expect(api.deleteChecklist).toHaveBeenCalledWith('draft-1');
  });
});
