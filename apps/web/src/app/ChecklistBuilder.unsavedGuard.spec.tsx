// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  updateChecklist: vi.fn(),
  listChecklistItemGroups: vi.fn(),
  listChecklistScales: vi.fn(),
  getChecklistWorkplaceSettings: vi.fn().mockRejectedValue(new Error('offline')),
}));
vi.mock('../shared/api/checklists.js', () => api);

import { ApiClientError } from '../shared/apiClient.js';
import { ChecklistBuilder } from '../features/admin-checklists/ChecklistBuilder';

const checklist = {
  id: 'c1', organizationId: 'org-1', title: 'Касса', description: null, status: 'draft' as const, scoringMode: 'sum_points' as const,
  passThreshold: 80, requiresReview: false, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  scaleLevels: null, itemGroups: [], contextFields: [],
  items: [{ id: 'i1', checklistId: 'c1', order: 1, text: 'Критерий', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: null }],
};

let root: ReturnType<typeof createRoot> | undefined;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  vi.clearAllMocks();
});

async function mount(handlers: { onBack?: () => void; onReload?: () => Promise<void> } = {}) {
  api.updateChecklist.mockResolvedValue(checklist);
  api.listChecklistItemGroups.mockResolvedValue([]);
  api.listChecklistScales.mockResolvedValue([]);
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const t = ((key: string, fallback?: string) => fallback ?? key) as never;
  const props = { onBack: handlers.onBack ?? vi.fn(), onReload: handlers.onReload ?? vi.fn(async () => {}) };
  await act(async () => {
    root?.render(<ChecklistBuilder checklist={checklist} statusLabels={{ draft: 'Draft', published: 'Published', archived: 'Archived' }} scoringModeLabels={{ sum_points: 'Sum', all_required: 'All', scale: 'Scale', none: 'None' }} t={t} {...props} />);
  });
  return { container, ...props };
}

function typeTitle(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>('#checklist-title')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const button = (container: HTMLElement, label: string) => [...container.querySelectorAll('button')].find((entry) => entry.textContent === label)!;

describe('ChecklistBuilder unsaved settings (PR 417)', () => {
  it('shows the unsaved bar only while the settings differ from the saved ones, and Discard restores them', async () => {
    const { container } = await mount();
    expect(container.querySelector('[data-testid="checklist-unsaved-bar"]')).toBeNull();
    await act(async () => { typeTitle(container, 'Новое имя'); });
    expect(container.querySelector('[data-testid="checklist-unsaved-bar"]')?.textContent).toContain('There are unsaved changes');
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-testid="checklist-unsaved-bar"] button')!.click(); });
    expect(container.querySelector<HTMLInputElement>('#checklist-title')!.value).toBe('Касса');
    expect(container.querySelector('[data-testid="checklist-unsaved-bar"]')).toBeNull();
  });

  it('Publish sends the unsaved settings together with the status in one request', async () => {
    const { container, onReload } = await mount();
    await act(async () => { typeTitle(container, 'Касса 2'); });
    await act(async () => { button(container, 'Publish').click(); });
    expect(api.updateChecklist).toHaveBeenCalledTimes(1);
    expect(api.updateChecklist).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Касса 2', status: 'published' }));
    expect(onReload).toHaveBeenCalled();
  });

  it('Publish without edits sends only the status', async () => {
    const { container } = await mount();
    await act(async () => { button(container, 'Publish').click(); });
    expect(api.updateChecklist).toHaveBeenCalledWith('c1', { status: 'published' });
  });

  it('a failed publish shows the error at the top and keeps what was typed', async () => {
    const { container, onReload } = await mount();
    api.updateChecklist.mockRejectedValue(new ApiClientError('Нельзя опубликовать', 400));
    await act(async () => { typeTitle(container, 'Касса 2'); });
    await act(async () => { button(container, 'Publish').click(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Нельзя опубликовать');
    expect(container.querySelector<HTMLInputElement>('#checklist-title')!.value).toBe('Касса 2');
    expect(onReload).not.toHaveBeenCalled();
  });

  it('Preview saves unsaved settings first and does not open when the save fails', async () => {
    const { container } = await mount();
    api.updateChecklist.mockRejectedValue(new ApiClientError('Сервер недоступен', 500));
    await act(async () => { typeTitle(container, 'Касса 2'); });
    await act(async () => { button(container, 'Preview').click(); });
    expect(api.updateChecklist).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Касса 2' }));
    expect(container.textContent).not.toContain('Sample employee');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Сервер недоступен');
  });

  it('leaving with unsaved settings asks: Stay keeps the editor, Don’t save leaves, Save saves and leaves', async () => {
    const onBack = vi.fn();
    const { container } = await mount({ onBack });
    await act(async () => { typeTitle(container, 'Касса 2'); });

    await act(async () => { container.querySelector<HTMLButtonElement>('.admin-back-link')!.click(); });
    expect(onBack).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Unsaved changes');
    await act(async () => { button(container, 'Stay').click(); });
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => { container.querySelector<HTMLButtonElement>('.admin-back-link')!.click(); });
    await act(async () => { button(container, 'Don’t save').click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(api.updateChecklist).not.toHaveBeenCalled();

    await act(async () => { container.querySelector<HTMLButtonElement>('.admin-back-link')!.click(); });
    await act(async () => { [...container.querySelectorAll('dialog button')].find((entry) => entry.textContent === 'Save')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(api.updateChecklist).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Касса 2' }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('leaving without unsaved settings does not ask', async () => {
    const onBack = vi.fn();
    const { container } = await mount({ onBack });
    await act(async () => { container.querySelector<HTMLButtonElement>('.admin-back-link')!.click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a menu link click with unsaved settings asks before navigating', async () => {
    const { container } = await mount();
    const link = document.createElement('a');
    link.href = '/admin/users';
    link.textContent = 'Users';
    document.body.appendChild(link);
    const navigated = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener('click', navigated);
    await act(async () => { typeTitle(container, 'Касса 2'); });
    await act(async () => { link.click(); });
    expect(navigated).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Unsaved changes');
    link.remove();
  });
});
