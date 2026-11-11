// @vitest-environment jsdom
import '../../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistPublicAccessState } from '../../shared/api/types.js';
import { ApiClientError } from '../../shared/apiClient.js';
import { ChecklistPublicAccessCard } from './ChecklistPublicAccessCard';

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), reissue: vi.fn() }));
vi.mock('../../shared/api/checklists.js', () => ({
  getChecklistPublicAccess: api.get,
  updateChecklistPublicAccess: api.update,
  reissueChecklistPublicAccess: api.reissue,
}));

const TOKEN = 'T'.repeat(32);
const state = (overrides: Partial<ChecklistPublicAccessState> = {}): ChecklistPublicAccessState => ({
  checklistId: 'c1', access: 'off', guestNameRequired: true, guestPhotosAllowed: false, dailyLimit: 200, eligible: true, hasLink: false,
  changedAt: null, changedBy: null, token: null, ...overrides,
});

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  api.get.mockReset(); api.update.mockReset(); api.reissue.mockReset();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { act(() => root?.unmount()); container?.remove(); });

async function render(props: Partial<Parameters<typeof ChecklistPublicAccessCard>[0]> = {}) {
  await i18n.changeLanguage('ru');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<ChecklistPublicAccessCard checklistId="c1" isAdmin savedAccessMode="free" status="published" title="Приёмка" {...props} />));
  await act(async () => undefined);
}
const text = () => container.textContent ?? '';
const radio = (value: string) => container.querySelector(`input[type="radio"][value="${value}"]`) as HTMLInputElement;
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
const dialog = () => document.querySelector('dialog[open]') as HTMLDialogElement | null;

describe('ChecklistPublicAccessCard (PR 466)', () => {
  it('explains instead of offering controls for a sheet that is not free or not published', async () => {
    await render({ savedAccessMode: 'assigned' });
    expect(text()).toContain('Сначала сохраните режим «Свободное прохождение»');
    expect(container.querySelector('input[type="radio"]')).toBeNull();
    act(() => root?.unmount());
    container.remove();
    await render({ status: 'draft' });
    expect(text()).toContain('после публикации чек-листа');
    expect(container.querySelector('input[type="radio"]')).toBeNull();
  });

  it('shows the state read-only to a non-administrator, without the link or the QR code', async () => {
    api.get.mockResolvedValue(state({ access: 'everyone', hasLink: true }));
    await render({ isAdmin: false });
    expect(container.querySelector('[data-testid="public-access-readonly"]')?.textContent).toContain('Все, даже незарегистрированные');
    expect(container.querySelector('input[type="radio"]')).toBeNull();
    expect(container.querySelector('[data-testid="public-access-qr"]')).toBeNull();
    expect(container.querySelector('#checklist-public-link')).toBeNull();
  });

  it('with the entry off shows one audience switch and no link', async () => {
    api.get.mockResolvedValue(state());
    await render();
    expect(['off', 'registered', 'everyone'].map((v) => radio(v).checked)).toEqual([true, false, false]);
    expect(container.querySelector('#checklist-public-link')).toBeNull();
  });

  it('asks before switching to "everyone", says what it means, and sends the change with the stamp seen', async () => {
    api.get.mockResolvedValue(state({ changedAt: '2026-11-01T10:00:00.000Z' }));
    api.update.mockResolvedValue(state({ access: 'everyone', hasLink: true, token: TOKEN, changedAt: '2026-11-11T10:00:00.000Z' }));
    await render();
    await act(async () => radio('everyone').click());
    expect(dialog()?.textContent).toContain('любому человеку в интернете');
    expect(api.update).not.toHaveBeenCalled();
    await act(async () => button('Включить').click());
    expect(api.update).toHaveBeenCalledWith('c1', { access: 'everyone', expectedChangedAt: '2026-11-01T10:00:00.000Z' });
    // The warning stays on the screen while the mode is on, the link and QR code appear.
    expect(text()).toContain('Чек-лист открыт для любого, у кого есть ссылка');
    expect((container.querySelector('#checklist-public-link') as HTMLInputElement).value).toBe(`${window.location.origin}/c/${TOKEN}`);
    expect(container.querySelector('[data-testid="public-access-qr"] img')).not.toBeNull();
    expect(container.querySelector('#checklist-guest-name')).not.toBeNull();
  });

  it('cancelling the confirmation changes nothing', async () => {
    api.get.mockResolvedValue(state());
    await render();
    await act(async () => radio('registered').click());
    await act(async () => button('Отмена').click());
    expect(api.update).not.toHaveBeenCalled();
    expect(radio('off').checked).toBe(true);
  });

  it('copies the link', async () => {
    api.get.mockResolvedValue(state({ access: 'registered', hasLink: true, token: TOKEN }));
    await render();
    await act(async () => button('Скопировать').click());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/c/${TOKEN}`);
    expect(button('Скопировано')).toBeTruthy();
  });

  it('warns about what a reissue does and calls it only after the confirmation', async () => {
    api.get.mockResolvedValue(state({ access: 'everyone', hasLink: true, token: TOKEN }));
    api.reissue.mockResolvedValue(state({ access: 'everyone', hasLink: true, token: 'N'.repeat(32) }));
    await render();
    await act(async () => button('Перевыпустить ссылку').click());
    expect(dialog()?.textContent).toContain('напечатанные или отправленные QR-коды сразу перестанут работать');
    expect(dialog()?.textContent).toContain('Это нельзя отменить');
    expect(api.reissue).not.toHaveBeenCalled();
    const confirm = [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Перевыпустить ссылку') as HTMLButtonElement;
    await act(async () => confirm.click());
    expect(api.reissue).toHaveBeenCalledWith('c1');
    expect((container.querySelector('#checklist-public-link') as HTMLInputElement).value).toContain('N'.repeat(32));
  });

  it('warns before switching off', async () => {
    api.get.mockResolvedValue(state({ access: 'registered', hasLink: true, token: TOKEN }));
    api.update.mockResolvedValue(state({ access: 'off', hasLink: true }));
    await render();
    await act(async () => radio('off').click());
    expect(dialog()?.textContent).toContain('все напечатанные QR-коды сразу перестанут работать');
    await act(async () => button('Выключить').click());
    expect(api.update).toHaveBeenCalledWith('c1', expect.objectContaining({ access: 'off' }));
    expect(container.querySelector('#checklist-public-link')).toBeNull();
  });

  it('shows the server error and reloads on a conflict', async () => {
    api.get.mockResolvedValue(state());
    api.update.mockRejectedValue(new ApiClientError('Conflict', 409));
    await render();
    await act(async () => radio('registered').click());
    await act(async () => button('Включить').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Другой администратор изменил это одновременно');
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('shows a load error with a retry', async () => {
    api.get.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(state());
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Не удалось загрузить доступ по ссылке');
    await act(async () => button('Повторить').click());
    expect(radio('off')).toBeTruthy();
  });

  it('changes the guest rules and the daily limit at once', async () => {
    api.get.mockResolvedValue(state({ access: 'everyone', hasLink: true, token: TOKEN }));
    api.update.mockResolvedValue(state({ access: 'everyone', hasLink: true, token: TOKEN, guestPhotosAllowed: true }));
    await render();
    const photos = [...container.querySelectorAll('input[type="checkbox"]')][0] as HTMLInputElement;
    await act(async () => photos.click());
    expect(api.update).toHaveBeenCalledWith('c1', expect.objectContaining({ guestPhotosAllowed: true }));
    const limit = container.querySelector('#checklist-public-daily-limit') as HTMLInputElement;
    limit.value = '50';
    api.update.mockResolvedValue(state({ access: 'everyone', hasLink: true, token: TOKEN, dailyLimit: 50 }));
    await act(async () => { limit.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(api.update).toHaveBeenLastCalledWith('c1', expect.objectContaining({ dailyLimit: 50 }));
  });
});
