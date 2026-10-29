// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

const mocks = vi.hoisted(() => ({
  api: { updateChecklist: vi.fn(), updateChecklistItem: vi.fn(), listChecklistItemGroups: vi.fn(), listChecklistScales: vi.fn() },
  roles: ['instructor'] as string[],
}));
vi.mock('../shared/api/checklists.js', () => mocks.api);
vi.mock('../shared/session.js', () => ({ useOptionalSession: () => ({ currentUser: { id: 'u1', roles: mocks.roles } }) }));

import { ChecklistBuilder } from '../features/admin-checklists/ChecklistBuilder';

const checklist = {
  id: 'c1', organizationId: 'org-1', title: 'Касса', description: null, status: 'draft' as const, scoringMode: 'sum_points' as const,
  passThreshold: 80, requiresReview: false, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  scaleLevels: null, items: [], itemGroups: [], contextFields: [], accessMode: 'free' as const, allowEditByAll: true,
};
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const t = i18n.t.bind(i18n) as never;
  await act(async () => {
    root.render(<ChecklistBuilder checklist={checklist as never} statusLabels={{ draft: 'Draft', published: 'Published', archived: 'Archived' }} scoringModeLabels={{ sum_points: 'Sum', all_required: 'All', scale: 'Scale' }} onBack={() => {}} onReload={async () => {}} t={t} />);
  });
}

beforeEach(async () => {
  await i18n.changeLanguage('ru');
  mocks.api.listChecklistItemGroups.mockResolvedValue([]);
  mocks.api.listChecklistScales.mockResolvedValue([]);
  mocks.api.updateChecklist.mockResolvedValue({});
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ChecklistBuilder: who switches the free-access mode (PR 366)', () => {
  it('shows the mode read-only to a non-admin and keeps sending the stored value', async () => {
    mocks.roles = ['instructor'];
    await render();
    expect(container.querySelector('select#checklist-access-mode')).toBeNull();
    expect(container.querySelector('#checklist-access-mode')?.textContent).toBe('Свободное прохождение');
    expect(container.textContent).toContain('Менять может только администратор.');
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Сохранить');
    await act(async () => { save?.click(); });
    expect(mocks.api.updateChecklist).toHaveBeenCalledWith('c1', expect.objectContaining({ accessMode: 'free' }));
  });

  it('lets an administrator change the mode', async () => {
    mocks.roles = ['admin'];
    await render();
    expect(container.querySelector('select#checklist-access-mode')).not.toBeNull();
    expect(container.textContent).not.toContain('Менять может только администратор.');
  });
});
