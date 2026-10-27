// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

const api = vi.hoisted(() => ({
  listMyChecklistInstances: vi.fn(),
  listFreeChecklists: vi.fn(),
  startFreeChecklist: vi.fn(),
  submitChecklistItemResult: vi.fn(),
  uploadChecklistItemPhoto: vi.fn(),
  getChecklistItemPhotoUrl: vi.fn(),
  getChecklistCoverUrl: vi.fn(),
}));
vi.mock('../shared/api/checklists.js', () => api);
vi.mock('./LearnerChecklistSessions.js', () => ({ LearnerChecklistSessions: () => null }));
vi.mock('./ObserverSessionsBlock.js', () => ({ ObserverSessionsBlock: () => null }));

import { LearnerChecklistsPage } from './LearnerChecklistsPage';

const free = (id: string, title: string, patch: Record<string, unknown> = {}) => ({
  id, title, description: null, itemCount: 2, pinned: false, activeInstanceId: null, activeInstanceStatus: null, ...patch,
});

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<LearnerChecklistsPage />); });
}

beforeEach(async () => {
  await i18n.changeLanguage('ru');
  api.listMyChecklistInstances.mockResolvedValue([]);
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('LearnerChecklistsPage: pinned tiles (PR 354)', () => {
  it('shows pinned checklists as tiles on top and keeps the rest in the big block', async () => {
    api.listFreeChecklists.mockResolvedValue([free('a', 'Закреплённый лист', { pinned: true }), free('b', 'Обычный лист')]);

    await render();

    const tiles = container.querySelector('section[aria-label="Закреплённые листы"]');
    expect(tiles?.textContent).toContain('Закреплённый лист');
    expect(tiles?.textContent).not.toContain('Обычный лист');
    const big = container.querySelector('#free-checklists-title')?.closest('section');
    expect(big?.textContent).toContain('Обычный лист');
    expect(big?.textContent).not.toContain('Закреплённый лист');
  });

  it('starts a checklist straight from its tile', async () => {
    api.listFreeChecklists.mockResolvedValue([free('a', 'Закреплённый лист', { pinned: true })]);
    api.startFreeChecklist.mockResolvedValue({ id: 'inst-1' });
    await render();

    const start = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Начать');
    await act(async () => { start?.click(); });

    expect(api.startFreeChecklist).toHaveBeenCalledWith('a');
  });

  it('offers to continue an unfinished pinned checklist', async () => {
    api.listFreeChecklists.mockResolvedValue([free('a', 'Закреплённый лист', { pinned: true, activeInstanceId: 'inst-9', activeInstanceStatus: 'in_progress' })]);
    await render();

    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Продолжить')).toBe(true);
  });

  it('hides the big block when every free checklist is pinned, and the tiles when none is', async () => {
    api.listFreeChecklists.mockResolvedValue([free('a', 'Закреплённый лист', { pinned: true })]);
    await render();
    expect(container.querySelector('#free-checklists-title')).toBeNull();
    expect(container.querySelector('section[aria-label="Закреплённые листы"]')).not.toBeNull();

    await act(async () => { root?.unmount(); });
    document.body.innerHTML = '';
    api.listFreeChecklists.mockResolvedValue([free('b', 'Обычный лист')]);
    await render();
    expect(container.querySelector('section[aria-label="Закреплённые листы"]')).toBeNull();
    expect(container.querySelector('#free-checklists-title')).not.toBeNull();
  });

  // PR 355: picture and access badges.
  it('shows the picture on a tile, the default illustration without one, and the access badges', async () => {
    api.getChecklistCoverUrl.mockResolvedValue({ url: 'https://storage.example.test/cover.png', expiresIn: 300 });
    api.listFreeChecklists.mockResolvedValue([
      free('a', 'Лист с картинкой', { pinned: true, coverUpdatedAt: '2026-10-27T10:00:00.000Z' }),
      free('b', 'Лист без картинки', { pinned: true }),
      free('c', 'Обычный лист'),
    ]);
    await render();

    const tiles = container.querySelector('section[aria-label="Закреплённые листы"]');
    expect(api.getChecklistCoverUrl).toHaveBeenCalledTimes(1);
    expect(api.getChecklistCoverUrl).toHaveBeenCalledWith('a');
    expect(tiles?.querySelector('img')?.getAttribute('alt')).toBe('Картинка листа «Лист с картинкой»');
    expect(tiles?.querySelectorAll('img').length).toBe(1);
    expect(tiles?.querySelectorAll('svg[role="img"]').length).toBe(1);
    expect(tiles?.querySelectorAll('.ds-badge').length).toBe(2);
    expect([...tiles!.querySelectorAll('.ds-badge')].every((badge) => badge.textContent === 'В панели')).toBe(true);
    const big = container.querySelector('#free-checklists-title')?.closest('section');
    expect(big?.querySelector('.ds-badge')?.textContent).toBe('Свободное прохождение');
  });

  it('falls back to the default illustration when the picture cannot be loaded', async () => {
    api.getChecklistCoverUrl.mockRejectedValue(new Error('offline'));
    api.listFreeChecklists.mockResolvedValue([free('a', 'Лист', { pinned: true, coverUpdatedAt: '2026-10-27T10:00:00.000Z' })]);
    await render();

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelectorAll('svg[role="img"]').length).toBe(1);
  });

  it('labels an assigned list row "По назначению" and a free one by the live catalog', async () => {
    const instance = (id: string, checklistId: string, title: string) => ({
      id, checklistId, status: 'assigned', dueAt: null, totalScore: 0, maxScore: 0, percentage: 0, passed: false, results: [],
      checklist: { id: checklistId, title, items: [] },
    });
    api.listMyChecklistInstances.mockResolvedValue([instance('i1', 'x', 'Назначенный'), instance('i2', 'a', 'Свободный закреплённый')]);
    api.listFreeChecklists.mockResolvedValue([free('a', 'Свободный закреплённый', { pinned: true })]);
    await render();

    const rows = [...container.querySelectorAll('li')].filter((li) => li.textContent?.includes('Назначенный') || li.textContent?.includes('Свободный закреплённый'));
    const badgeOf = (title: string) => rows.find((li) => li.querySelector('strong')?.textContent === title)?.querySelector('.ds-badge')?.textContent;
    expect(badgeOf('Назначенный')).toBe('По назначению');
    expect(badgeOf('Свободный закреплённый')).toBe('В панели');
  });
});
