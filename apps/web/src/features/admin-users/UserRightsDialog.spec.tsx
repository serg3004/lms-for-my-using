// @vitest-environment jsdom
import '../../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getUserPermissions: vi.fn(), listCustomRoles: vi.fn(), assignCustomRole: vi.fn(), revokeCustomRole: vi.fn() }));
vi.mock('../../shared/api/customRoles.js', () => api);

import { UserRightsDialog } from './UserRightsDialog';
import type { AdminUserSummary } from './model.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }, close(this: HTMLDialogElement) { this.removeAttribute('open'); } });
const user = { id: 'u1', firstName: 'Анна', lastName: 'Иванова', email: 'anna@x.kz', status: 'active', memberships: [] } as unknown as AdminUserSummary;
const roleA = { id: 'r1', name: 'Регистратор', description: null, state: 'active', version: 1, permissions: [] };
const roleB = { id: 'r2', name: 'Аналитик', description: null, state: 'active', version: 1, permissions: [] };
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => { await i18n.changeLanguage('ru'); });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
async function show(view: unknown) {
  api.getUserPermissions.mockResolvedValue(view);
  api.listCustomRoles.mockResolvedValue([roleA, roleB, { ...roleB, id: 'r3', name: 'Старая', state: 'archived' }]);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<UserRightsDialog user={user} onClose={vi.fn()} />));
  await flush();
}
const button = (name: string) => [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.trim() === name) as HTMLButtonElement | undefined;

describe('UserRightsDialog (PR 485)', () => {
  it('shows the assigned roles and the resulting rights with their scope and source', async () => {
    await show({ customRolesEnabled: true, customRoles: [{ id: 'r1', name: 'Регистратор' }], permissions: [{ action: 'user.read', builtIn: false, scopes: ['department'] }, { action: 'course.read', builtIn: true, scopes: [] }] });
    const text = host?.textContent ?? '';
    expect(text).toContain('Регистратор');
    expect(text).toContain('Видеть пользователей');
    expect(text).toContain('Моё подразделение');
    expect(text).toContain('встроенная роль');
    expect(host?.querySelector('select')?.textContent).not.toContain('Старая');
    expect(host?.querySelector('select')?.textContent).not.toContain('Регистратор');
  });

  it('warns that nothing works while the organization switch is off', async () => {
    await show({ customRolesEnabled: false, customRoles: [], permissions: [] });
    expect(host?.textContent).toContain('выключены для организации');
    expect(host?.textContent).toContain('Индивидуальных ролей нет');
  });

  it('revokes a role and reloads the rights', async () => {
    await show({ customRolesEnabled: true, customRoles: [{ id: 'r1', name: 'Регистратор' }], permissions: [] });
    api.revokeCustomRole.mockResolvedValue({});
    await act(async () => { button('Снять')?.click(); });
    await flush();
    expect(api.revokeCustomRole).toHaveBeenCalledWith('r1', 'u1');
    expect(api.getUserPermissions).toHaveBeenCalledTimes(2);
  });

  it('says so when the rights cannot be loaded', async () => {
    api.getUserPermissions.mockRejectedValue(new Error('no'));
    api.listCustomRoles.mockResolvedValue([]);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root?.render(<UserRightsDialog user={user} onClose={vi.fn()} />));
    await flush();
    expect(host.textContent).toContain('Не удалось загрузить права пользователя');
  });
});
