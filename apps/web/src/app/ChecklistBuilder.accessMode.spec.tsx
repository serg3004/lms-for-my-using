// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

const api = vi.hoisted(() => ({
  updateChecklist: vi.fn(),
  updateChecklistItem: vi.fn(),
  listChecklistItemGroups: vi.fn(),
  listChecklistScales: vi.fn(),
  getChecklistWorkplaceSettings: vi.fn().mockRejectedValue(new Error('offline')),
}));
vi.mock('../shared/api/checklists.js', () => api);

import { ChecklistBuilder } from '../features/admin-checklists/ChecklistBuilder';

const base = {
  id: 'c1', organizationId: 'org-1', title: 'Касса', description: null, status: 'draft' as const, scoringMode: 'sum_points' as const,
  passThreshold: 80, requiresReview: false, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  scaleLevels: null, items: [], itemGroups: [], contextFields: [],
};

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;

async function render(checklist: Omit<typeof base, 'status'> & { status?: 'draft' | 'published'; accessMode?: 'assigned' | 'free'; pinned?: boolean }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const t = i18n.t.bind(i18n) as never;
  await act(async () => {
    root?.render(<ChecklistBuilder checklist={checklist as never} statusLabels={{ draft: 'Draft', published: 'Published', archived: 'Archived' }} scoringModeLabels={{ sum_points: 'Sum', all_required: 'All', scale: 'Scale' }} onBack={() => {}} onReload={async () => {}} t={t} />);
  });
}
const select = () => container.querySelector<HTMLSelectElement>('#checklist-access-mode')!;
async function choose(value: string) {
  await act(async () => {
    select().value = value;
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(async () => {
  await i18n.changeLanguage('ru');
  api.listChecklistItemGroups.mockResolvedValue([]);
  api.listChecklistScales.mockResolvedValue([]);
  api.updateChecklist.mockResolvedValue({});
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ChecklistBuilder: access mode (PR 353)', () => {
  it('defaults to "by assignment" for a checklist without a mode and labels the field', async () => {
    await render(base);

    expect(select().value).toBe('assigned');
    expect(container.querySelector('label[for="checklist-access-mode"]')?.textContent).toBe('Как проходят лист');
    expect([...select().options].map((option) => option.textContent)).toEqual(['По назначению', 'Свободное прохождение']);
  });

  it('shows the saved free mode and explains it', async () => {
    await render({ ...base, accessMode: 'free' });

    expect(select().value).toBe('free');
    expect(container.textContent).toContain('Любой пользователь организации может сам начать опубликованный лист');
  });

  it('saves the chosen mode with the other settings', async () => {
    await render(base);
    await choose('free');

    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Сохранить');
    await act(async () => { save?.click(); });

    expect(api.updateChecklist).toHaveBeenCalledWith('c1', expect.objectContaining({ accessMode: 'free' }));
  });

  it('does not report unsaved changes until the mode is changed', async () => {
    await render({ ...base, accessMode: 'free' });
    expect(container.textContent).not.toContain('Есть несохранённые изменения');

    await choose('assigned');

    expect(container.textContent).toContain('Есть несохранённые изменения');
  });
});

const pinBox = () => container.querySelector<HTMLInputElement>('input[type="checkbox"][data-pin]') ?? [...container.querySelectorAll<HTMLLabelElement>('label')].find((label) => label.textContent?.includes('Закрепить в панели'))?.querySelector('input') ?? null;

describe('ChecklistBuilder: pin to the dashboard (PR 354)', () => {
  it('shows the pin option only for a free checklist', async () => {
    await render(base);
    expect(pinBox()).toBeNull();

    await choose('free');
    expect(pinBox()).not.toBeNull();

    await choose('assigned');
    expect(pinBox()).toBeNull();
  });

  it('disables the pin for a draft and explains why', async () => {
    await render({ ...base, accessMode: 'free' });

    expect(pinBox()?.disabled).toBe(true);
    expect(container.textContent).toContain('Доступно после публикации листа');
  });

  it('saves the pin of a published free checklist', async () => {
    await render({ ...base, status: 'published', accessMode: 'free' });
    expect(pinBox()?.disabled).toBe(false);

    await act(async () => { pinBox()?.click(); });
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Сохранить');
    await act(async () => { save?.click(); });

    expect(api.updateChecklist).toHaveBeenCalledWith('c1', expect.objectContaining({ accessMode: 'free', pinned: true }));
  });

  it('clears the pin in the same save when the mode goes back to assigned', async () => {
    await render({ ...base, status: 'published', accessMode: 'free', pinned: true });
    await choose('assigned');
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Сохранить');
    await act(async () => { save?.click(); });

    expect(api.updateChecklist).toHaveBeenCalledWith('c1', expect.objectContaining({ accessMode: 'assigned', pinned: false }));
  });

  it('explains the limit when the server answers 409', async () => {
    const { ApiClientError } = await import('../shared/apiClient.js');
    api.updateChecklist.mockRejectedValue(new ApiClientError('At most 8 checklists can be pinned.', 409));
    await render({ ...base, status: 'published', accessMode: 'free' });
    await act(async () => { pinBox()?.click(); });
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Сохранить');
    await act(async () => { save?.click(); });

    expect(container.textContent).toContain('Уже закреплено 8 листов');
  });
});
