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
async function render(props: { openInstanceId?: string | null } = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<LearnerChecklistsPage {...props} />); });
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
  it('shows pinned checklists as tiles on top and also lists every checklist in the big block (PR 355 follow-up)', async () => {
    api.listFreeChecklists.mockResolvedValue([free('a', 'Закреплённый лист', { pinned: true }), free('b', 'Обычный лист')]);

    await render();

    const tiles = container.querySelector('section[aria-label="Закреплённые листы"]');
    expect(tiles?.textContent).toContain('Закреплённый лист');
    expect(tiles?.textContent).not.toContain('Обычный лист');
    const big = container.querySelector('#all-checklists-title')?.closest('section');
    expect(big?.textContent).toContain('Обычный лист');
    expect(big?.textContent).toContain('Закреплённый лист');
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

  it('hides the tiles when nothing is pinned, and the big block when there is nothing to list', async () => {
    api.listFreeChecklists.mockResolvedValue([free('a', 'Закреплённый лист', { pinned: true })]);
    await render();
    expect(container.querySelector('#all-checklists-title')).not.toBeNull();
    expect(container.querySelector('section[aria-label="Закреплённые листы"]')).not.toBeNull();

    await act(async () => { root?.unmount(); });
    document.body.innerHTML = '';
    api.listFreeChecklists.mockResolvedValue([free('b', 'Обычный лист')]);
    await render();
    expect(container.querySelector('section[aria-label="Закреплённые листы"]')).toBeNull();
    expect(container.querySelector('#all-checklists-title')).not.toBeNull();

    await act(async () => { root?.unmount(); });
    document.body.innerHTML = '';
    api.listFreeChecklists.mockResolvedValue([]);
    await render();
    expect(container.querySelector('#all-checklists-title')).toBeNull();
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
    // The picture is requested once for the tile and once for the row of the same checklist.
    expect(api.getChecklistCoverUrl).toHaveBeenCalledTimes(2);
    expect(api.getChecklistCoverUrl).toHaveBeenCalledWith('a');
    expect(tiles?.querySelector('img')?.getAttribute('alt')).toBe('Картинка листа «Лист с картинкой»');
    expect(tiles?.querySelectorAll('img').length).toBe(1);
    expect(tiles?.querySelectorAll('svg[role="img"]').length).toBe(1);
    expect(tiles?.querySelectorAll('[data-access-kind]').length).toBe(2);
    expect([...tiles!.querySelectorAll('[data-access-kind]')].every((badge) => badge.textContent === 'В панели')).toBe(true);
    const big = container.querySelector('#all-checklists-title')?.closest('section');
    const bigRow = (title: string) => [...big!.querySelectorAll('li')].find((li) => li.querySelector('strong')?.textContent === title);
    expect(bigRow('Обычный лист')?.querySelector('[data-access-kind]')?.textContent).toBe('Свободное прохождение');
    expect(bigRow('Лист с картинкой')?.querySelector('[data-access-kind]')?.textContent).toBe('В панели');
    expect(bigRow('Лист с картинкой')?.querySelector('img')).not.toBeNull();
  });

  it('falls back to the default illustration when the picture cannot be loaded', async () => {
    api.getChecklistCoverUrl.mockRejectedValue(new Error('offline'));
    api.listFreeChecklists.mockResolvedValue([free('a', 'Лист', { pinned: true, coverUpdatedAt: '2026-10-27T10:00:00.000Z' })]);
    await render();

    expect(container.querySelector('img')).toBeNull();
    // tile + row
    expect(container.querySelectorAll('svg[role="img"]').length).toBe(2);
  });

  it('labels an assigned list row "По назначению" and a free one by the live catalog', async () => {
    const instance = (id: string, checklistId: string, title: string) => ({
      id, checklistId, status: 'assigned', dueAt: null, totalScore: 0, maxScore: 0, percentage: 0, passed: false, results: [],
      checklist: { id: checklistId, title, items: [] },
    });
    api.listMyChecklistInstances.mockResolvedValue([instance('i1', 'x', 'Назначенный'), instance('i2', 'a', 'Свободный закреплённый')]);
    api.listFreeChecklists.mockResolvedValue([free('a', 'Свободный закреплённый', { pinned: true })]);
    await render();

    const rows = [...container.querySelectorAll('#all-checklists-title ~ ul li')].filter((li) => li.textContent?.includes('Назначенный') || li.textContent?.includes('Свободный закреплённый'));
    const badgeOf = (title: string) => rows.find((li) => li.querySelector('strong')?.textContent === title)?.querySelector('[data-access-kind]')?.textContent;
    expect(badgeOf('Назначенный')).toBe('По назначению');
    expect(badgeOf('Свободный закреплённый')).toBe('В панели');
  });

  it('opens the instance named by the openInstanceId prop (a start from the learner home)', async () => {
    api.listMyChecklistInstances.mockResolvedValue([{
      id: 'i1', checklistId: 'a', status: 'assigned', dueAt: null, totalScore: 0, maxScore: 0, percentage: 0, passed: false, results: [],
      checklist: { id: 'a', title: 'Открытый с главной', items: [], scoringMode: 'checkbox' },
    }]);
    api.listFreeChecklists.mockResolvedValue([free('a', 'Открытый с главной', { pinned: true, activeInstanceId: 'i1' })]);

    await render({ openInstanceId: 'i1' });

    expect(container.querySelector('h1')?.textContent).toBe('Открытый с главной');
  });
});
