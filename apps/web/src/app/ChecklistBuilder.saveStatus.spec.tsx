// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  updateChecklist: vi.fn(),
  listChecklistItemGroups: vi.fn(),
  listChecklistScales: vi.fn(),
}));
vi.mock('../shared/api/checklists.js', () => api);

import { ChecklistBuilder } from '../features/admin-checklists/ChecklistBuilder';

const checklist = {
  id: 'c1', organizationId: 'org-1', title: 'Касса', description: null, status: 'draft' as const, scoringMode: 'sum_points' as const,
  passThreshold: 80, requiresReview: false, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  items: [], itemGroups: [], contextFields: [],
};

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  vi.clearAllMocks();
});

function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ChecklistBuilder save status (PR 340)', () => {
  it('always tells whether the settings are saved', async () => {
    api.updateChecklist.mockResolvedValue(checklist);
    api.listChecklistItemGroups.mockResolvedValue([]);
    api.listChecklistScales.mockResolvedValue([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const t = ((key: string, fallback?: string) => fallback ?? key) as never;
    await act(async () => {
      root?.render(<ChecklistBuilder checklist={checklist} statusLabels={{ draft: 'Draft', published: 'Published', archived: 'Archived' }} scoringModeLabels={{ sum_points: 'Sum', all_required: 'All', scale: 'Scale' }} onBack={() => {}} onReload={async () => {}} t={t} />);
    });
    const status = () => container.querySelector('p[role="status"]:not([style])')?.textContent;
    expect(status()).toBe('All changes are saved.');

    await act(async () => { setValue(container.querySelector<HTMLInputElement>('#checklist-title')!, 'Касса 2'); });
    expect(status()).toBe('There are unsaved changes.');

    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Save');
    await act(async () => { save?.click(); });
    expect(api.updateChecklist).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Касса 2' }));
    expect(status()).toBe('All changes are saved.');

    await act(async () => { setValue(container.querySelector<HTMLInputElement>('#checklist-title')!, 'Касса'); });
    expect(status()).toBe('There are unsaved changes.');
  });
});
