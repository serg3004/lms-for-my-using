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
}));
vi.mock('../shared/api/checklists.js', () => api);
vi.mock('./LearnerChecklistSessions.js', () => ({ LearnerChecklistSessions: () => null }));
vi.mock('./ObserverSessionsBlock.js', () => ({ ObserverSessionsBlock: () => null }));

import { ApiClientError } from '../shared/apiClient.js';
import { LearnerChecklistsPage } from './LearnerChecklistsPage';

const free = (patch: Record<string, unknown> = {}) => ({
  id: 'free-1', title: 'Открытие смены', description: 'Проверьте зал', itemCount: 3, pinned: false, activeInstanceId: null, activeInstanceStatus: null, ...patch,
});
const instance = (id: string, title: string) => ({
  id, organizationId: 'org-1', checklistId: 'free-1', userId: 'u1', assignedBy: 'u1', status: 'assigned', totalScore: null, maxScore: 30,
  percentage: null, passed: null, dueAt: null, submittedAt: null, completedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  results: [],
  checklist: {
    id: 'free-1', organizationId: 'org-1', title, description: null, status: 'published', scoringMode: 'sum_points', passThreshold: 80,
    scaleLevels: null, requiresReview: false, createdBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items: [],
  },
});

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<LearnerChecklistsPage />); });
}
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label);

beforeEach(async () => {
  await i18n.changeLanguage('ru');
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('LearnerChecklistsPage: free-access catalog (PR 353)', () => {
  it('shows the catalog even when nothing is assigned, without criteria text', async () => {
    api.listMyChecklistInstances.mockResolvedValue([]);
    api.listFreeChecklists.mockResolvedValue([free()]);

    await render();

    expect(container.textContent).toContain('Свободное прохождение');
    expect(container.textContent).toContain('Открытие смены');
    expect(container.textContent).toContain('Критериев: 3');
    expect(container.textContent).not.toContain('У вас пока нет назначенных');
    expect(container.textContent).not.toContain('Самостоятельные чек-листы');
    expect(button('Начать')).toBeTruthy();
  });

  it('starts a free checklist and opens the created instance', async () => {
    api.listMyChecklistInstances.mockResolvedValueOnce([]).mockResolvedValue([instance('inst-1', 'Открытие смены')]);
    api.listFreeChecklists.mockResolvedValue([free()]);
    api.startFreeChecklist.mockResolvedValue(instance('inst-1', 'Открытие смены'));
    await render();

    await act(async () => { button('Начать')?.click(); });

    expect(api.startFreeChecklist).toHaveBeenCalledWith('free-1');
    expect(container.querySelector('h1')?.textContent).toBe('Открытие смены');
  });

  it('offers to continue an unfinished instance instead of starting a second one', async () => {
    api.listMyChecklistInstances.mockResolvedValue([instance('inst-9', 'Открытие смены')]);
    api.listFreeChecklists.mockResolvedValue([free({ activeInstanceId: 'inst-9', activeInstanceStatus: 'assigned' })]);
    await render();

    expect(button('Начать')).toBeUndefined();
    await act(async () => { button('Продолжить')?.click(); });

    expect(api.startFreeChecklist).not.toHaveBeenCalled();
    expect(container.querySelector('h1')?.textContent).toBe('Открытие смены');
  });

  it('shows the server error and stays on the list when starting fails', async () => {
    api.listMyChecklistInstances.mockResolvedValue([]);
    api.listFreeChecklists.mockResolvedValue([free()]);
    api.startFreeChecklist.mockRejectedValue(new ApiClientError('Checklist not found', 404));
    await render();

    await act(async () => { button('Начать')?.click(); });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Checklist not found');
    expect(button('Начать')).toBeTruthy();
    expect((button('Начать') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the rest of the page working when the catalog cannot be loaded', async () => {
    api.listMyChecklistInstances.mockResolvedValue([instance('inst-1', 'Назначенный лист')]);
    api.listFreeChecklists.mockRejectedValue(new Error('boom'));

    await render();

    expect(container.textContent).toContain('Назначенный лист');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Не удалось загрузить свободные листы');
  });

  it('shows only the assigned list and no free badge when there are no free checklists', async () => {
    api.listMyChecklistInstances.mockResolvedValue([instance('inst-1', 'Назначенный лист')]);
    api.listFreeChecklists.mockResolvedValue([]);

    await render();

    expect(container.querySelector('#all-checklists-title')).not.toBeNull();
    expect(container.textContent).toContain('Назначенный лист');
    expect(container.textContent).not.toContain('Свободное прохождение');
  });
});
