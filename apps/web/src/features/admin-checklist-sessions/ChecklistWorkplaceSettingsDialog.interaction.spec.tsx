// @vitest-environment jsdom
import '../../i18n/index.js';
import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChecklistWorkplaceSettingsDialog } from './ChecklistWorkplaceSettingsDialog.js';

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), users: vi.fn() }));
vi.mock('../../shared/api/checklists.js', () => ({ getChecklistWorkplaceSettings: mocks.get, updateChecklistWorkplaceSettings: mocks.update }));
vi.mock('../../shared/api/users.js', () => ({ listUsers: mocks.users }));
const original = {
  organizationId: 'org', moduleEnabled: true, highPerformanceThreshold: 90, lowThreshold: null, resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' }, defaultGeolocationPolicy: 'off', feedbackVisibility: 'after_completion', updatedAt: null,
  observerEligibility: 'selected_roles', observerRoles: ['instructor', 'manager', 'admin'], observerUserIds: [], selectedObserverUsers: [],
};
const person = { id: 'person-1', firstName: 'Лена', lastName: 'Тестова', email: 'lena@example.test', status: 'active' };
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const t = i18n.t.bind(i18n);
beforeEach(async () => {
  await i18n.changeLanguage('ru');
  vi.useFakeTimers();
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }, close(this: HTMLDialogElement) { this.removeAttribute('open'); },
  });
  mocks.get.mockResolvedValue({ ...original });
  mocks.update.mockImplementation(async (payload) => ({ ...original, ...payload }));
  mocks.users.mockResolvedValue({ items: [person], total: 21, page: 1, pageSize: 20 });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.clearAllMocks();
});
async function render() {
  await act(async () => root.render(<ChecklistWorkplaceSettingsDialog open onClose={vi.fn()} t={t} />));
}
async function click(label: string) {
  const button = Array.from(host.querySelectorAll('button')).find((node) => node.textContent === label);
  expect(button).toBeDefined(); await act(async () => button!.click());
}
async function mode(value: string) {
  const select = host.querySelector('fieldset select') as HTMLSelectElement;
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('observer eligibility settings (PR 351)', () => {
  it('loads defaults, edits role choices and saves the selection', async () => {
    await render();
    const mentor = Array.from(host.querySelectorAll('label')).find((node) => node.textContent?.includes('Наставник'))!.querySelector('input')!;
    await act(async () => mentor.click());
    await click('Сохранить');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ observerEligibility: 'selected_roles', observerRoles: ['instructor', 'manager', 'admin', 'mentor'], observerUserIds: [] }));
  });

  it('preserves selected people across pages and reports failed lookup without losing selection', async () => {
    await render(); await mode('selected_users');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const checkbox = Array.from(host.querySelectorAll('label')).find((node) => node.textContent?.includes(person.email))!.querySelector('input')!;
    await act(async () => checkbox.click());
    mocks.users.mockRejectedValueOnce(new Error('offline'));
    await click('Далее');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(mocks.users).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, status: 'active' }));
    expect(host.textContent).toContain('Не удалось загрузить пользователей');
    expect(host.textContent).toContain(person.email);
    await click('Сохранить');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ observerEligibility: 'selected_users', observerUserIds: [person.id] }));
  });

  it('changes to any-user mode and keeps save errors visible with the chosen mode', async () => {
    await render(); await mode('any_user');
    mocks.update.mockRejectedValueOnce(new Error('offline'));
    await click('Сохранить');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ observerEligibility: 'any_user' }));
    expect(host.textContent).toContain('Не удалось сохранить настройки');
    expect((host.querySelector('fieldset select') as HTMLSelectElement).value).toBe('any_user');
    expect(mocks.users).not.toHaveBeenCalled();
  });

  it('keeps previously selected people visible and allows removing deleted entries', async () => {
    mocks.get.mockResolvedValue({ ...original, observerEligibility: 'selected_users', observerUserIds: [person.id, 'deleted-id'], selectedObserverUsers: [person] });
    await render();
    expect(host.textContent).toContain(person.email);
    expect(host.textContent).not.toContain('deleted-id');
    await click('Убрать недоступных пользователей'); await click('Сохранить');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ observerUserIds: [person.id] }));
  });
});

describe('result colours (PR 369б)', () => {
  it('shows the ranges that follow the thresholds and saves the chosen colours', async () => {
    mocks.get.mockResolvedValue({ ...original, lowThreshold: 60 });
    await render();
    expect(host.textContent).toContain('Цвета результата');
    expect(host.textContent).toContain('Ниже 60%');
    expect(host.textContent).toContain('От 60% до 90%');
    expect(host.textContent).toContain('От 90%');

    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label^="Цвет высокого результата: палитра"]')?.click(); });
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="Цвет высокого результата: #1565C0"]')?.click(); });
    await click('Сохранить');

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ resultColorLow: '#C62828', resultColorMid: '#F9A825', resultColorHigh: '#1565C0' }));
  });

  it('hides the low range when no low threshold is set', async () => {
    await render();
    expect(host.textContent).toContain('Ниже 90%');
    expect(host.querySelector('button[aria-label^="Цвет низкого результата"]')).toBeNull();
  });
});
