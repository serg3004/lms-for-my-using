// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

import { ApiClientError } from '../shared/apiClient.js';

const api = vi.hoisted(() => ({ startFreeChecklist: vi.fn() }));
vi.mock('../shared/api/checklists.js', () => api);

import { PinnedChecklistStartButton } from './PinnedChecklistStartButton';

const item = (patch: Record<string, unknown> = {}) => ({
  id: 'a', title: 'Лист', description: null, itemCount: 2, pinned: true, activeInstanceId: null, activeInstanceStatus: null, ...patch,
}) as never;

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
const assign = vi.fn();
async function render(props: Record<string, unknown> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<PinnedChecklistStartButton item={item(props)} />); });
}

beforeEach(async () => {
  await i18n.changeLanguage('ru');
  Object.defineProperty(window, 'location', { configurable: true, value: { assign } });
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('PinnedChecklistStartButton', () => {
  it('starts the checklist and opens the new instance on the checklists page', async () => {
    api.startFreeChecklist.mockResolvedValue({ id: 'inst 1' });
    await render();

    await act(async () => { container.querySelector('button')?.click(); });

    expect(api.startFreeChecklist).toHaveBeenCalledWith('a');
    expect(assign).toHaveBeenCalledWith('/learn/checklists?open=inst%201');
  });

  it('continues an unfinished instance without starting a second one', async () => {
    await render({ activeInstanceId: 'inst-9', activeInstanceStatus: 'in_progress' });

    expect(container.querySelector('button')?.textContent).toBe('Продолжить');
    await act(async () => { container.querySelector('button')?.click(); });

    expect(api.startFreeChecklist).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('/learn/checklists?open=inst-9');
  });

  it('shows the server error and stays on the page when starting fails', async () => {
    api.startFreeChecklist.mockRejectedValue(new ApiClientError('Checklist not found', 404));
    await render();

    await act(async () => { container.querySelector('button')?.click(); });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Checklist not found');
    expect(assign).not.toHaveBeenCalled();
    expect(container.querySelector('button')?.disabled).toBe(false);
  });
});
