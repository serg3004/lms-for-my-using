// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../shared/apiClient.js';

const roles = vi.hoisted(() => ({ listCustomRoles: vi.fn(), createCustomRole: vi.fn(), updateCustomRole: vi.fn(), archiveCustomRole: vi.fn(), listRoleAssignments: vi.fn(), assignCustomRole: vi.fn(), revokeCustomRole: vi.fn() }));
vi.mock('../shared/api/customRoles.js', () => roles);
const org = vi.hoisted(() => ({ getOrganizationFeatures: vi.fn(), saveOrganizationFeatures: vi.fn() }));
vi.mock('../shared/api/organizations.js', () => org);
const client = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../shared/apiClient.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../shared/apiClient.js')>()), apiRequest: client.apiRequest }));
vi.mock('../shared/session.js', () => ({ useSession: () => ({ currentUser: { id: 'a1', organizationId: 'org1', roles: ['admin'] } }), useOptionalSession: () => null }));

import { AdminCustomRolesPage } from './AdminCustomRolesPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }, close(this: HTMLDialogElement) { this.removeAttribute('open'); } });
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })));
  await i18n.changeLanguage('ru');
  client.apiRequest.mockResolvedValue({ items: [{ id: 'u1', firstName: 'Анна', lastName: 'Иванова', email: 'anna@x.kz' }] });
  org.getOrganizationFeatures.mockResolvedValue({ longreadEnabled: false, customRolesEnabled: false });
  roles.listRoleAssignments.mockResolvedValue([]);
});

const role = { id: 'r1', name: 'Регистратор', description: null, state: 'active', version: 3, permissions: [{ action: 'user.read', scope: 'department' }], userCount: 2 };
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
async function show() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MemoryRouter><AdminCustomRolesPage /></MemoryRouter>));
  await flush();
}
const button = (name: string) => [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.trim() === name) as HTMLButtonElement | undefined;
async function type(element: Element | null | undefined, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  await act(async () => { setter?.call(element, value); element?.dispatchEvent(new Event('input', { bubbles: true })); element?.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('custom roles page (PR 485)', () => {
  it('shows an empty state when there are no roles', async () => {
    roles.listCustomRoles.mockResolvedValue([]);
    await show();
    expect(host?.textContent).toContain('Ролей пока нет');
    expect(host?.textContent).toContain('Индивидуальные роли выключены');
  });

  it('answers 403 with a clear message instead of an empty screen', async () => {
    roles.listCustomRoles.mockRejectedValue(new ApiClientError('Forbidden', 403));
    await show();
    expect(host?.textContent).toContain('Управлять ролями может только администратор');
  });

  it('shows an error when loading fails', async () => {
    roles.listCustomRoles.mockRejectedValue(new ApiClientError('Boom', 500));
    await show();
    expect(host?.textContent).toContain('Не удалось загрузить роли');
  });

  it('lists roles with state and user count and opens the editor with the rights', async () => {
    roles.listCustomRoles.mockResolvedValue([role, { ...role, id: 'r2', name: 'Старая', state: 'archived', userCount: 0 }]);
    await show();
    expect(host?.textContent).toContain('Регистратор');
    expect(host?.textContent).toContain('В архиве');
    await act(async () => { button('Регистратор')?.click(); });
    expect((host?.querySelector('#role-name') as HTMLInputElement).value).toBe('Регистратор');
    expect((host?.querySelector('#grant-user\\.read') as HTMLInputElement).checked).toBe(true);
    expect(host?.textContent).toContain('Пользователи с этой ролью');
  });

  it('validates a new role: name and at least one right', async () => {
    roles.listCustomRoles.mockResolvedValue([]);
    await show();
    await act(async () => { button('Создать роль')?.click(); });
    await act(async () => { button('Сохранить')?.click(); });
    expect(host?.textContent).toContain('Введите название роли');
    expect(host?.textContent).toContain('Выберите хотя бы одно право');
    expect(roles.createCustomRole).not.toHaveBeenCalled();
  });

  it('creates a role with the rights it needs added automatically', async () => {
    roles.listCustomRoles.mockResolvedValue([]);
    roles.createCustomRole.mockResolvedValue({ ...role, id: 'new', name: 'Новая' });
    await show();
    await act(async () => { button('Создать роль')?.click(); });
    await type(host?.querySelector('#role-name'), 'Новая');
    await act(async () => { (host?.querySelector('#grant-user\\.create') as HTMLInputElement).click(); });
    expect((host?.querySelector('#grant-user\\.read') as HTMLInputElement).checked).toBe(true);
    expect(host?.textContent).toContain('Также добавлено то, что нужно этому праву');
    roles.listCustomRoles.mockResolvedValue([{ ...role, id: 'new', name: 'Новая' }]);
    await act(async () => { button('Сохранить')?.click(); });
    await flush();
    const sent = roles.createCustomRole.mock.calls[0]?.[0] as { name: string; permissions: Array<{ action: string }> };
    expect(sent.name).toBe('Новая');
    expect(sent.permissions.map((grant) => grant.action).sort()).toEqual(['user.create', 'user.read']);
    expect(host?.textContent).toContain('Роль сохранена');
  });

  it('explains a version conflict and reloads the current version on request', async () => {
    roles.listCustomRoles.mockResolvedValue([role]);
    roles.updateCustomRole.mockRejectedValue(new ApiClientError('The role was changed by someone else, reload it', 409));
    await show();
    await act(async () => { button('Регистратор')?.click(); });
    await type(host?.querySelector('#role-name'), 'Регистратор 2');
    await act(async () => { button('Сохранить')?.click(); });
    await flush();
    expect(host?.textContent).toContain('Роль уже изменил кто-то другой');
    roles.listCustomRoles.mockResolvedValue([{ ...role, name: 'Серверное имя', version: 4 }]);
    await act(async () => { host?.querySelector<HTMLButtonElement>('[role="alert"] button')?.click(); });
    await flush();
    expect(host?.textContent).toContain('Серверное имя');
  });

  it('asks before archiving and sends the version it read', async () => {
    roles.listCustomRoles.mockResolvedValue([role]);
    roles.archiveCustomRole.mockResolvedValue({ ...role, state: 'archived', version: 4 });
    await show();
    await act(async () => { button('Регистратор')?.click(); });
    await act(async () => { button('Архивировать')?.click(); });
    expect(roles.archiveCustomRole).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('потеряют эти права со следующего запроса');
    const confirm = [...document.querySelectorAll('dialog[open] button')].find((item) => item.textContent?.trim() === 'Архивировать') as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    await flush();
    expect(roles.archiveCustomRole).toHaveBeenCalledWith('r1', 3);
  });

  it('warns about unsaved changes before opening another role', async () => {
    roles.listCustomRoles.mockResolvedValue([role, { ...role, id: 'r2', name: 'Другая' }]);
    await show();
    await act(async () => { button('Регистратор')?.click(); });
    await type(host?.querySelector('#role-name'), 'Изменено');
    await act(async () => { button('Другая')?.click(); });
    expect(document.body.textContent).toContain('В роли есть несохранённые изменения');
    expect((host?.querySelector('#role-name') as HTMLInputElement).value).toBe('Изменено');
  });

  it('assigns and revokes a role from the list of users', async () => {
    roles.listCustomRoles.mockResolvedValue([role]);
    roles.listRoleAssignments.mockResolvedValue([{ userId: 'u9', assignedAt: '2026-11-19T10:00:00Z', email: 'oleg@x.kz', firstName: 'Олег', lastName: 'Петров' }]);
    roles.assignCustomRole.mockResolvedValue({});
    roles.revokeCustomRole.mockResolvedValue({});
    await show();
    await act(async () => { button('Регистратор')?.click(); });
    await flush();
    expect(host?.textContent).toContain('Петров Олег');
    await act(async () => { button('Снять')?.click(); });
    expect(roles.revokeCustomRole).toHaveBeenCalledWith('r1', 'u9');
    await type(host?.querySelector('select[aria-label="Кому назначить"]'), 'u1');
    await act(async () => { button('Назначить')?.click(); });
    expect(roles.assignCustomRole).toHaveBeenCalledWith('r1', 'u1');
  });

  it('turns the switch on after a confirmation and keeps the longread flag', async () => {
    roles.listCustomRoles.mockResolvedValue([]);
    org.saveOrganizationFeatures.mockResolvedValue({ longreadEnabled: false, customRolesEnabled: true });
    await show();
    await act(async () => { button('Включить')?.click(); });
    const confirm = [...document.querySelectorAll('dialog[open] button')].find((item) => item.textContent?.trim() === 'Включить') as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    expect(org.saveOrganizationFeatures).toHaveBeenCalledWith('org1', { longreadEnabled: false, customRolesEnabled: true });
  });
});
