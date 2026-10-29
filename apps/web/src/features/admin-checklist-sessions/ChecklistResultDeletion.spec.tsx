// @vitest-environment jsdom
import '../../i18n/index.js';
import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteResultDialog, DeletedChecklistResults } from './ChecklistResultDeletion.js';

const mocks = vi.hoisted(() => ({ del: vi.fn(), restore: vi.fn(), list: vi.fn() }));
vi.mock('../../shared/api/checklists.js', () => ({ deleteChecklistResult: mocks.del, restoreChecklistResult: mocks.restore, listDeletedChecklistResults: mocks.list }));

const row = {
  id: 'i1', deletedAt: '2026-10-29T10:00:00.000Z', reason: 'Entered by mistake', restorableUntil: '2026-11-28T10:00:00.000Z', percentage: 90, passed: true, completedAt: null,
  checklist: { id: 'c1', title: 'Касса' }, user: { id: 'u1', firstName: 'Лена', lastName: 'Тестова', email: 'lena@example.test' },
};
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const t = i18n.t.bind(i18n);
beforeEach(async () => {
  await i18n.changeLanguage('ru');
  Object.assign(HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }, close(this: HTMLDialogElement) { this.removeAttribute('open'); } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });
const button = (label: string) => Array.from(host.querySelectorAll('button')).find((node) => node.textContent === label)!;

describe('administrator result deletion (PR 367)', () => {
  it('requires a reason, sends it trimmed and reports the deletion', async () => {
    mocks.del.mockResolvedValue({ id: 'i1' });
    const onDeleted = vi.fn();
    await act(async () => root.render(<DeleteResultDialog open instanceId="i1" onClose={vi.fn()} onDeleted={onDeleted} t={t} />));
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    const field = host.querySelector('textarea')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, '  Ошибка ввода  '); field.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(submit.disabled).toBe(false);
    await act(async () => submit.click());
    expect(mocks.del).toHaveBeenCalledWith('i1', 'Ошибка ввода');
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open and shows the error when the server refuses', async () => {
    mocks.del.mockRejectedValue(new Error('offline'));
    const onDeleted = vi.fn();
    await act(async () => root.render(<DeleteResultDialog open instanceId="i1" onClose={vi.fn()} onDeleted={onDeleted} t={t} />));
    const field = host.querySelector('textarea')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, 'Дубль'); field.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(onDeleted).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Не удалось удалить результат.');
  });

  it('lists deleted results with the reason and restores one; stays hidden when there are none', async () => {
    mocks.list.mockResolvedValueOnce({ items: [] });
    await act(async () => root.render(<DeletedChecklistResults t={t} />));
    expect(host.textContent).toBe('');
    await act(async () => root.unmount());
    root = createRoot(host);

    mocks.list.mockResolvedValueOnce({ items: [row] }).mockResolvedValueOnce({ items: [] });
    mocks.restore.mockResolvedValue({ id: 'i1' });
    await act(async () => root.render(<DeletedChecklistResults t={t} />));
    expect(host.textContent).toContain('Удалённые результаты (1)');
    expect(host.textContent).toContain('Entered by mistake');
    await act(async () => button('Восстановить').click());
    expect(mocks.restore).toHaveBeenCalledWith('i1');
    expect(host.textContent).toBe('');
  });
});
