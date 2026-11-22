// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getOwnProfile: vi.fn(), updateOwnProfile: vi.fn(), uploadOwnPhoto: vi.fn(), removeOwnPhoto: vi.fn() }));
const client = vi.hoisted(() => ({
  apiDownloadRequest: vi.fn(),
  apiRequest: vi.fn(),
  ApiClientError: class ApiClientError extends Error { constructor(message: string, readonly status: number) { super(message); } },
}));
const refreshUser = vi.hoisted(() => vi.fn());
vi.mock('./api/auth.js', () => api);
vi.mock('./apiClient.js', () => client);
vi.mock('./session.js', () => ({ useSession: () => ({ refreshUser }) }));

import { OwnProfileCard } from './OwnProfileCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; });

const profile = { phone: null, locale: 'ru', timezone: 'Asia/Almaty', aboutMe: null, hasPhoto: false, version: 4 };

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(<OwnProfileCard />); });
  await act(async () => { await Promise.resolve(); });
  return container;
}
async function type(view: HTMLElement, selector: string, value: string) {
  const field = view.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')!.set!;
  await act(async () => { setter.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
}
const submit = async (view: HTMLElement) => { await act(async () => { view.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };

describe('OwnProfileCard (PR 496)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru');
    api.getOwnProfile.mockReset().mockResolvedValue(profile);
    api.updateOwnProfile.mockReset().mockResolvedValue({ ...profile, phone: '+77011234567', version: 5 });
    api.uploadOwnPhoto.mockReset();
    api.removeOwnPhoto.mockReset();
    client.apiDownloadRequest.mockReset();
    client.apiRequest.mockReset().mockResolvedValue({ items: [] });
    refreshUser.mockReset();
  });

  it('saves the edited fields with the version it read and refreshes the session', async () => {
    const view = await render();
    expect(view.textContent).toContain('ФИО, почту, должность, смену и роль меняет администратор или руководитель.');
    await type(view, '#own-profile-phone', '+77011234567');
    await type(view, '#own-profile-about', 'Кладовщик');
    await submit(view);
    expect(api.updateOwnProfile).toHaveBeenCalledWith({ version: 4, phone: '+77011234567', timezone: 'Asia/Almaty', aboutMe: 'Кладовщик' });
    expect(refreshUser).toHaveBeenCalled();
    expect(view.textContent).toContain('Профиль сохранён.');
  });

  it('shows the custom fields the person may see, edits only their own editable ones and sends just the change (PR 500)', async () => {
    const labels = (ru: string) => ({ ru, en: ru, kk: ru, zh: ru });
    client.apiRequest.mockResolvedValue({ items: [
      { key: 'telegram', labels: labels('Telegram'), type: 'phone', required: false, unique: false, searchable: false, options: null, sortOrder: 1, editable: true },
      { key: 'hire_date', labels: labels('Дата приёма'), type: 'date', required: false, unique: false, searchable: false, options: null, sortOrder: 2, editable: false },
    ] });
    api.getOwnProfile.mockResolvedValue({ ...profile, customFields: { telegram: '+77010000000', hire_date: '2026-01-02' } });
    const view = await render();
    expect(view.textContent).toContain('Дополнительные данные');
    expect((view.querySelector('#own-field-hire_date') as HTMLInputElement).disabled).toBe(true);
    expect((view.querySelector('#own-field-hire_date') as HTMLInputElement).value).toBe('2026-01-02');
    await type(view, '#own-field-telegram', '+77019998877');
    await submit(view);
    expect(api.updateOwnProfile).toHaveBeenCalledWith(expect.objectContaining({ version: 4, customFields: { telegram: '+77019998877' } }));
  });

  it('refuses a bad phone number before sending anything', async () => {
    const view = await render();
    await type(view, '#own-profile-phone', 'позвоните мне');
    await submit(view);
    expect(api.updateOwnProfile).not.toHaveBeenCalled();
    expect(view.textContent).toContain('Введите номер цифрами');
  });

  it('reloads the profile and explains a conflict', async () => {
    api.updateOwnProfile.mockRejectedValue(new client.ApiClientError('conflict', 409));
    const view = await render();
    await type(view, '#own-profile-about', 'Другое');
    await submit(view);
    expect(view.textContent).toContain('Профиль изменили в другом месте');
    expect(api.getOwnProfile).toHaveBeenCalledTimes(2);
  });

  it('does not send a photo of the wrong type or size', async () => {
    const view = await render();
    const input = view.querySelector<HTMLInputElement>('#own-profile-photo')!;
    const pick = async (file: File) => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    await pick(new File(['x'], 'me.gif', { type: 'image/gif' }));
    expect(view.textContent).toContain('Фото должно быть в формате JPEG, PNG или WebP.');
    await pick(new File([new Uint8Array(1_048_577)], 'me.png', { type: 'image/png' }));
    expect(view.textContent).toContain('Фото должно быть не больше 1 МБ.');
    expect(api.uploadOwnPhoto).not.toHaveBeenCalled();
  });
});
