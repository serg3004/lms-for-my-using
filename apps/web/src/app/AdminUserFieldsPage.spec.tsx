// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listUserFields: vi.fn(), createUserField: vi.fn(), updateUserField: vi.fn(), archiveUserField: vi.fn(), restoreUserField: vi.fn(),
  deleteUserField: vi.fn(), reorderUserFields: vi.fn(), applyUserFieldTemplate: vi.fn(),
}));
vi.mock('../shared/api/userFields.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../shared/api/userFields.js')>()), ...api }));
vi.mock('../shared/session.js', () => ({ useSession: () => ({ currentUser: { id: 'a1', organizationId: 'org1', roles: ['admin'] } }), useOptionalSession: () => null }));

import { AdminUserFieldsPage } from './AdminUserFieldsPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
const labels = (ru: string, en = ru) => ({ ru, en, kk: ru, zh: ru });
const definition = (key: string, ru: string, extra: Record<string, unknown> = {}) => ({
  id: key, key, labels: labels(ru), type: 'text', required: false, unique: false, searchable: false, options: null, visibleTo: ['manager', 'self'], editableBy: ['self'], sortOrder: 10, archived: false, valueCount: 3, ...extra,
});

afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })));
  await i18n.changeLanguage('ru');
  api.listUserFields.mockReset().mockResolvedValue({ items: [definition('employee_number', 'Табельный номер', { unique: true, searchable: true, editableBy: [] }), definition('telegram', 'Telegram', { type: 'phone' })] });
  for (const name of ['createUserField', 'updateUserField', 'archiveUserField', 'restoreUserField', 'deleteUserField', 'reorderUserFields']) (api as Record<string, ReturnType<typeof vi.fn>>)[name]!.mockReset().mockResolvedValue({});
  api.applyUserFieldTemplate.mockReset().mockResolvedValue({ created: [] });
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const button = (name: string, scope: ParentNode | undefined = host) => [...(scope?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.trim().startsWith(name)) as HTMLButtonElement | undefined;
async function show() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MemoryRouter><AdminUserFieldsPage /></MemoryRouter>));
  await flush();
}
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('user fields page (PR 500)', () => {
  it('lists the fields with type, rules, access and how many people have a value', async () => {
    await show();
    const text = host?.textContent ?? '';
    expect(text).toContain('Табельный номер');
    expect(text).toContain('уникальное, ищется');
    expect(text).toContain('руководитель: видит; сотрудник: видит');
    expect(text).toContain('сотрудник: правит');
    expect(host?.querySelector('code')?.textContent).toBe('employee_number');
  });

  it('creates a field: the key follows the title, one title fills every language, and the API gets the rights', async () => {
    await show();
    await act(async () => button('Добавить поле')?.click());
    const dialog = host?.querySelector('dialog') as HTMLDialogElement;
    await act(async () => type(dialog.querySelector('#field-label-ru') as HTMLInputElement, 'Размер обуви'));
    expect((dialog.querySelector('#field-key') as HTMLInputElement).value).toBe('razmer_obuvi');
    await act(async () => { (dialog.querySelector('select#field-type') as HTMLSelectElement).value = 'number'; (dialog.querySelector('select#field-type') as HTMLSelectElement).dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => button('Сохранить', dialog)?.click());
    await flush();
    expect(api.createUserField).toHaveBeenCalledWith(expect.objectContaining({
      key: 'razmer_obuvi', type: 'number', labels: labels('Размер обуви'), visibleTo: ['manager', 'self'], editableBy: [],
    }));
  });

  it('refuses a field without a title', async () => {
    await show();
    await act(async () => button('Добавить поле')?.click());
    const dialog = host?.querySelector('dialog') as HTMLDialogElement;
    await act(async () => button('Сохранить', dialog)?.click());
    expect(dialog.textContent).toContain('Укажите название хотя бы на одном языке.');
    expect(api.createUserField).not.toHaveBeenCalled();
  });

  it('warns how many people hold a value before archiving, and deletes only an archived field', async () => {
    await show();
    await act(async () => button('Архивировать')?.click());
    expect(document.body.textContent).toContain('у людей: 3');
    const confirm = [...document.querySelectorAll('dialog button')].find((item) => item.textContent?.trim() === 'Архивировать' && item.closest('dialog')?.hasAttribute('open')) as HTMLButtonElement;
    await act(async () => confirm.click());
    await flush();
    expect(api.archiveUserField).toHaveBeenCalledWith('employee_number');
    // Without the archive step no delete button exists.
    expect(button('Удалить')).toBeUndefined();

    api.listUserFields.mockResolvedValue({ items: [definition('telegram', 'Telegram', { archived: true })] });
    const toggle = host?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => toggle.click());
    await flush();
    expect(button('Вернуть')).toBeDefined();
    await act(async () => button('Удалить')?.click());
    expect(document.body.textContent).toContain('будут удалены без возможности вернуть');
  });

  it('moves a field up and down, and restores the standard set', async () => {
    await show();
    const down = [...(host?.querySelectorAll('button') ?? [])].find((item) => item.getAttribute('aria-label')?.startsWith('Ниже')) as HTMLButtonElement;
    await act(async () => down.click());
    await flush();
    expect(api.reorderUserFields).toHaveBeenCalledWith(['telegram', 'employee_number']);
    await act(async () => button('Вернуть стандартный набор')?.click());
    await flush();
    expect(host?.textContent).toContain('Все поля стандартного набора уже есть.');
  });
});
