// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

const api = vi.hoisted(() => ({
  updateChecklist: vi.fn(),
  updateChecklistItem: vi.fn(),
  listChecklistItemGroups: vi.fn(),
  listChecklistScales: vi.fn(),
  getChecklistWorkplaceSettings: vi.fn().mockRejectedValue(new Error('offline')),
  createChecklistScale: vi.fn(),
  createChecklistItem: vi.fn(),
}));
vi.mock('../shared/api/checklists.js', () => api);

import { ChecklistBuilder } from '../features/admin-checklists/ChecklistBuilder';

Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  close(this: HTMLDialogElement) { this.removeAttribute('open'); },
});

const item = { id: 'item-1', checklistId: 'c1', order: 0, text: 'Работа с кассой', points: 10, isRequired: true, photoRequired: false, groupId: null, scaleId: null };
const checklist = {
  id: 'c1', organizationId: 'org-1', title: 'Касса', description: null, status: 'draft' as const, scoringMode: 'sum_points' as const,
  passThreshold: 80, requiresReview: false, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  scaleLevels: null, items: [item], itemGroups: [], contextFields: [],
};

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ChecklistBuilder: create a scale from the criterion dropdown (PR 343)', () => {
  it('opens the level editor, creates the scale and attaches it to that criterion', async () => {
    const created = { id: 'scale-new', organizationId: 'org-1', name: 'Да/Нет/Частично', status: 'active', inUse: false, isDefault: false, levels: [{ value: 1, label: 'Нет', score: 0 }, { value: 2, label: 'Да', score: 100 }] };
    api.listChecklistItemGroups.mockResolvedValue([]);
    api.listChecklistScales.mockResolvedValue([]);
    api.createChecklistScale.mockResolvedValue(created);
    api.updateChecklistItem.mockResolvedValue({ ...item, scaleId: 'scale-new' });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const t = i18n.t.bind(i18n) as never;
    await act(async () => {
      root?.render(<ChecklistBuilder checklist={checklist} statusLabels={{ draft: 'Draft', published: 'Published', archived: 'Archived' }} scoringModeLabels={{ sum_points: 'Sum', all_required: 'All', scale: 'Scale' }} onBack={() => {}} onReload={async () => {}} t={t} />);
    });

    const select = container.querySelector<HTMLSelectElement>('select.admin-criteria-row__scale')!;
    await act(async () => {
      select.value = '__create_scale__';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const dialog = [...document.querySelectorAll<HTMLElement>('dialog[open]')].find((d) => d.querySelector('input[aria-label="Название уровня 1"]'))!;
    expect(dialog).toBeTruthy();
    const input = (label: string) => dialog.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    await act(async () => {
      setValue(dialog.querySelector<HTMLInputElement>('input:not([aria-label])')!, 'Да/Нет/Частично');
      setValue(input('Название уровня 1'), 'Нет');
      setValue(input('Название уровня 2'), 'Да');
    });
    const submit = [...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes('Создать'));
    await act(async () => { submit?.click(); });

    expect(api.createChecklistScale).toHaveBeenCalledWith({
      name: 'Да/Нет/Частично',
      levels: [{ value: 1, label: 'Нет', score: 0, color: '#C62828' }, { value: 2, label: 'Да', score: 100, color: '#2E7D32' }],
    });
    expect(api.updateChecklistItem).toHaveBeenCalledWith('item-1', { scaleId: 'scale-new' });
  });
});


it('PR 358: keeps the server-selected default scale and uses it in a sum-points preview', async () => {
  const scale = { id: 'default-scale', name: 'Да/Нет', status: 'active', isDefault: true, levels: [{ value: 1, label: 'Нет', score: 0 }, { value: 2, label: 'Да', score: 100 }] };
  api.listChecklistItemGroups.mockResolvedValue([]);
  api.listChecklistScales.mockResolvedValue([scale]);
  api.createChecklistItem.mockResolvedValue({ ...item, id: 'new', scaleId: scale.id });
  const container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root?.render(<ChecklistBuilder checklist={{ ...checklist, items: [] }} statusLabels={{ draft: 'Draft', published: 'Published', archived: 'Archived' }} scoringModeLabels={{ sum_points: 'Sum', all_required: 'All', scale: 'Scale' }} onBack={() => {}} onReload={async () => {}} t={i18n.t.bind(i18n) as never} />));
  const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text))!;
  await act(async () => button('Критерий').click());
  expect(api.createChecklistItem).toHaveBeenCalledWith('c1', expect.not.objectContaining({ scaleId: null }));
  expect(container.querySelector<HTMLSelectElement>('select.admin-criteria-row__scale')?.value).toBe('default-scale');
  await act(async () => button('Предпросмотр').click());
  const dialog = document.querySelector('dialog.admin-preview-overlay[open]')!;
  const no = [...dialog.querySelectorAll<HTMLLabelElement>('label')].find((label) => label.textContent?.startsWith('Нет'))!.querySelector<HTMLInputElement>('input[type=radio]')!;
  await act(async () => no.click());
  expect(no.checked).toBe(true);
  expect(dialog.querySelector('.admin-preview-result')?.textContent).toContain('0 / 100 (0%)');
  expect(dialog.querySelector('.admin-preview-result')?.textContent).not.toContain('Не все');
});
