// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listChecklistTransferCandidates: vi.fn(),
  listChecklistTransferHistory: vi.fn(),
  transferChecklistInstance: vi.fn(),
}));
vi.mock('../shared/api/checklists.js', () => api);

import { ApiClientError } from '../shared/apiClient.js';
import { ChecklistTransferButton, ChecklistTransferHistory } from './ChecklistTransfer.js';

let root: ReturnType<typeof createRoot> | undefined;
const t = () => i18n.t.bind(i18n) as never;
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement | undefined;
const flush = () => act(async () => { await Promise.resolve(); });

async function render(node: React.ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(node); });
}
async function openDialog(onTransferred = vi.fn()) {
  await render(<ChecklistTransferButton instanceId="inst-1" expectedUpdatedAt="2026-11-19T05:00:00.000Z" onTransferred={onTransferred} t={t()} />);
  await act(async () => { button('Передать проверку…')?.click(); });
  await flush();
  return onTransferred;
}
async function choose(value: string) {
  const select = document.querySelector('select') as HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(async () => {
  await i18n.changeLanguage('ru');
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
  api.listChecklistTransferCandidates.mockResolvedValue([{ id: 'u2', firstName: 'Анна', lastName: 'Иванова' }, { id: 'u3', firstName: 'Борис', lastName: 'Петров' }]);
  api.transferChecklistInstance.mockResolvedValue({ id: 'inst-1', userId: 'u2' });
});
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ChecklistTransferButton (PR 477)', () => {
  it('loads the colleagues only when the window opens and lists them by name', async () => {
    await render(<ChecklistTransferButton instanceId="inst-1" expectedUpdatedAt="v1" onTransferred={vi.fn()} t={t()} />);
    expect(api.listChecklistTransferCandidates).not.toHaveBeenCalled();
    await act(async () => { button('Передать проверку…')?.click(); });
    await flush();
    expect(api.listChecklistTransferCandidates).toHaveBeenCalledWith('inst-1');
    expect([...document.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Выберите коллегу', 'Иванова Анна', 'Петров Борис']);
    expect(document.body.textContent).toContain('После передачи вы не сможете её править.');
  });

  it('keeps the button disabled until a colleague is chosen, then hands over with the note and the version on screen', async () => {
    const onTransferred = await openDialog();
    expect(button('Передать')?.disabled).toBe(true);
    await choose('u2');
    const note = document.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(note, '  Касса открыта  ');
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(note.maxLength).toBe(500);
    await act(async () => { button('Передать')?.click(); });
    await flush();
    expect(api.transferChecklistInstance).toHaveBeenCalledWith('inst-1', { toUserId: 'u2', note: 'Касса открыта', expectedUpdatedAt: '2026-11-19T05:00:00.000Z' });
    expect(onTransferred).toHaveBeenCalledTimes(1);
  });

  it('says there is nobody to hand over to, with no form', async () => {
    api.listChecklistTransferCandidates.mockResolvedValue([]);
    await openDialog();
    expect(document.body.textContent).toContain('Нет доступных коллег');
    expect(document.querySelector('select')).toBeNull();
    expect(button('Передать')?.disabled).toBe(true);
  });

  it('shows a failure to load the colleagues and no form', async () => {
    api.listChecklistTransferCandidates.mockRejectedValue(new Error('boom'));
    await openDialog();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Не удалось загрузить список коллег.');
    expect(document.querySelector('select')).toBeNull();
  });

  it('tells about a conflict (409) with a reload button and keeps the window open', async () => {
    api.transferChecklistInstance.mockRejectedValue(new ApiClientError('conflict', 409));
    const onTransferred = await openDialog();
    await choose('u3');
    await act(async () => { button('Передать')?.click(); });
    await flush();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Проверка изменилась. Обновите страницу и попробуйте снова.');
    expect(button('Обновить')).toBeDefined();
    expect(onTransferred).not.toHaveBeenCalled();
  });

  it('shows a general error for any other failure and does not leave the screen', async () => {
    api.transferChecklistInstance.mockRejectedValue(new ApiClientError('nope', 400));
    const onTransferred = await openDialog();
    await choose('u2');
    await act(async () => { button('Передать')?.click(); });
    await flush();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Не удалось передать проверку.');
    expect(button('Обновить')).toBeUndefined();
    expect(onTransferred).not.toHaveBeenCalled();
  });

  it('is named and described for assistive technology and every control is at least 44px tall', async () => {
    await openDialog();
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Передать проверку коллеге');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toContain('вместе с ответами и фото');
    for (const name of ['Передать', 'Отмена']) expect(button(name)?.style.minHeight).toBe('44px');
  });
});

describe('ChecklistTransferHistory (PR 477)', () => {
  it('renders nothing when there were no hand-overs or the history cannot be read', async () => {
    api.listChecklistTransferHistory.mockResolvedValue([]);
    await render(<ChecklistTransferHistory instanceId="inst-1" t={t()} />);
    await flush();
    expect(document.body.textContent).toBe('');
    api.listChecklistTransferHistory.mockRejectedValue(new Error('x'));
    await act(async () => { root?.render(<ChecklistTransferHistory instanceId="inst-2" t={t()} />); });
    await flush();
    expect(document.body.textContent).toBe('');
  });

  it('lists who handed the check to whom, in order, with the note', async () => {
    api.listChecklistTransferHistory.mockResolvedValue([
      { id: 'e1', at: '2026-11-19T05:00:00.000Z', note: 'Смена закончилась', from: { id: 'u1', firstName: 'Анна', lastName: 'Иванова' }, to: { id: 'u2', firstName: 'Борис', lastName: 'Петров' } },
      { id: 'e2', at: '2026-11-19T09:00:00.000Z', note: null, from: { id: 'u2', firstName: 'Борис', lastName: 'Петров' }, to: null },
    ]);
    await render(<ChecklistTransferHistory instanceId="inst-1" t={t()} />);
    await flush();
    expect(document.querySelector('h2')?.textContent).toBe('История передач');
    const items = [...document.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(items[0]).toContain('Иванова Анна → Петров Борис');
    expect(items[0]).toContain('Заметка: Смена закончилась');
    expect(items[1]).toContain('Петров Борис → Сотрудник');
    expect(items[1]).not.toContain('Заметка');
  });
});
