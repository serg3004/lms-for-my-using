// @vitest-environment jsdom
import '../../i18n/index.js';
import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChecklistTemplateDialog } from './ChecklistTemplateDialog.js';

const mocks = vi.hoisted(() => ({
  builtIn: vi.fn(), org: vi.fn(), fromOrg: vi.fn(), fromBuiltIn: vi.fn(), rename: vi.fn(), remove: vi.fn(), roles: ['instructor'] as string[],
}));
vi.mock('../../shared/api/checklists.js', () => ({
  listChecklistTemplates: mocks.builtIn, listChecklistOrgTemplates: mocks.org, createChecklistFromOrgTemplate: mocks.fromOrg,
  createChecklistFromTemplate: mocks.fromBuiltIn, updateChecklistOrgTemplate: mocks.rename, deleteChecklistOrgTemplate: mocks.remove,
}));
vi.mock('../../shared/session.js', () => ({ useOptionalSession: () => ({ currentUser: { roles: mocks.roles } }) }));

const orgTemplate = { id: 't1', title: 'Открытие смены', description: null, groupCount: 2, itemCount: 7, createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z' };
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
const t = i18n.t.bind(i18n);
beforeEach(async () => {
  await i18n.changeLanguage('ru');
  Object.assign(HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }, close(this: HTMLDialogElement) { this.removeAttribute('open'); } });
  mocks.builtIn.mockResolvedValue({ items: [] });
  mocks.org.mockResolvedValue({ items: [orgTemplate] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });
async function render(onCreated = vi.fn()) {
  await act(async () => root.render(<ChecklistTemplateDialog open locale="ru" onClose={vi.fn()} onCreated={onCreated} t={t} />));
  return onCreated;
}
const button = (label: string) => Array.from(host.querySelectorAll('button')).find((node) => node.textContent === label);

describe('organization templates in the template dialog (PR 367)', () => {
  it('lets a builder start from an organization template but not rename or delete it', async () => {
    mocks.roles = ['instructor'];
    mocks.fromOrg.mockResolvedValue({ id: 'new' });
    const onCreated = await render();
    expect(host.textContent).toContain('Шаблоны организации');
    expect(host.textContent).toContain('Открытие смены');
    expect(button('Переименовать')).toBeUndefined();
    expect(button('Удалить')).toBeUndefined();
    await act(async () => button('Использовать')!.click());
    expect(mocks.fromOrg).toHaveBeenCalledWith('t1');
    expect(onCreated).toHaveBeenCalledWith({ id: 'new' });
  });

  it('lets an administrator rename and delete', async () => {
    mocks.roles = ['admin'];
    mocks.rename.mockResolvedValue({ ...orgTemplate, title: 'Новое имя' });
    mocks.remove.mockResolvedValue({ id: 't1' });
    await render();
    await act(async () => button('Переименовать')!.click());
    const input = host.querySelector<HTMLInputElement>('input')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Новое имя'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => button('Сохранить')!.click());
    expect(mocks.rename).toHaveBeenCalledWith('t1', { title: 'Новое имя' });
    expect(host.textContent).toContain('Новое имя');
    await act(async () => button('Удалить')!.click());
    expect(mocks.remove).toHaveBeenCalledWith('t1');
    expect(host.textContent).not.toContain('Шаблоны организации');
  });
});
