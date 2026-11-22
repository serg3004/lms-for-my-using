// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getCardPolicy: vi.fn(), saveCardPolicy: vi.fn(), listInspectors: vi.fn(), createInspector: vi.fn(), revokeInspector: vi.fn(), listCardViews: vi.fn() }));
vi.mock('./api/employeeCard.js', () => api);
vi.mock('../shared/api/employeeCard.js', () => api);

import { EmployeeCardPolicyCard } from './EmployeeCardPolicyCard';
import { InspectorsCard } from './InspectorsCard';
import { CardViewsCard } from '../features/badge/CardViewsCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => {
  await i18n.changeLanguage('ru');
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
async function mount(node: React.ReactNode) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(node));
  await flush();
}
const buttons = () => [...(host?.querySelectorAll('button') ?? [])] as HTMLButtonElement[];
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('EmployeeCardPolicyCard', () => {
  it('loads the blocks, lets the admin change them and saves', async () => {
    api.getCardPolicy.mockResolvedValue({ blocks: ['courses'] });
    api.saveCardPolicy.mockResolvedValue({ blocks: ['courses', 'clearance'] });
    await mount(<EmployeeCardPolicyCard organizationId="o1" />);
    const boxes = [...(host?.querySelectorAll('input[type="checkbox"]') ?? [])] as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([true, false, false, false]);
    await act(async () => boxes[3]?.click());
    await act(async () => (host?.querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(api.saveCardPolicy).toHaveBeenCalledWith('o1', ['courses', 'clearance']);
    expect(host?.querySelector('[role="status"]')).toBeTruthy();
  });

  it('reports load and save errors', async () => {
    api.getCardPolicy.mockRejectedValueOnce(new Error('x'));
    await mount(<EmployeeCardPolicyCard organizationId="o1" />);
    expect(host?.querySelector('[role="alert"]')).toBeTruthy();
    expect(buttons()[0]?.disabled).toBe(true);
    act(() => root?.unmount()); host?.remove();
    api.getCardPolicy.mockResolvedValue({ blocks: [] });
    api.saveCardPolicy.mockRejectedValue(new Error('x'));
    await mount(<EmployeeCardPolicyCard organizationId="o1" />);
    await act(async () => (host?.querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(host?.querySelector('[role="alert"]')).toBeTruthy();
  });
});

describe('InspectorsCard', () => {
  const item = { userId: 'i1', name: 'Пётр Инспектор', email: 'p@x.test', visible: ['clearance'], accessUntil: '2026-12-30T00:00:00.000Z', createdAt: '2026-11-22T00:00:00.000Z', state: 'active' };

  it('lists inspectors, invites one and revokes one after confirmation', async () => {
    api.listInspectors.mockResolvedValue({ items: [item, { ...item, userId: 'i2', state: 'revoked' }] });
    api.createInspector.mockResolvedValue({});
    api.revokeInspector.mockResolvedValue({ revoked: true });
    await mount(<InspectorsCard />);
    expect(host?.textContent).toContain('Пётр Инспектор');
    await type(host?.querySelector('#inspector-email') as HTMLInputElement, 'n@x.test');
    await type(host?.querySelector('#inspector-first') as HTMLInputElement, 'Ник');
    await type(host?.querySelector('#inspector-last') as HTMLInputElement, 'Ревизор');
    await act(async () => ((host?.querySelectorAll('form')[0]) as HTMLFormElement).requestSubmit());
    await flush();
    expect(api.createInspector).toHaveBeenCalledWith(expect.objectContaining({ email: 'n@x.test', firstName: 'Ник', lastName: 'Ревизор', visible: ['photo', 'clearance'] }));

    const revoke = buttons().filter((button) => button.className.includes('admin-btn--danger'));
    expect(revoke).toHaveLength(1);
    await act(async () => revoke[0]?.click());
    const confirm = [...document.querySelectorAll('button')].filter((button) => button.className.includes('danger')).pop() as HTMLButtonElement;
    await act(async () => confirm.click());
    await flush();
    expect(api.revokeInspector).toHaveBeenCalledWith('i1');
  });

  it('reports a failed invitation and a failed list', async () => {
    api.listInspectors.mockRejectedValue(new Error('x'));
    api.createInspector.mockRejectedValue(new Error('x'));
    await mount(<InspectorsCard />);
    expect(host?.querySelector('[role="alert"]')).toBeTruthy();
    await type(host?.querySelector('#inspector-email') as HTMLInputElement, 'n@x.test');
    await type(host?.querySelector('#inspector-first') as HTMLInputElement, 'Ник');
    await type(host?.querySelector('#inspector-last') as HTMLInputElement, 'Ревизор');
    await act(async () => ((host?.querySelectorAll('form')[0]) as HTMLFormElement).requestSubmit());
    await flush();
    expect(host?.textContent).toContain(i18n.t('employeeCard.inspectors.createError'));
  });
});

describe('CardViewsCard', () => {
  it('lists the latest views, says when there are none, and shows an error', async () => {
    api.listCardViews.mockResolvedValueOnce({ items: [{ viewer: 'Анна', at: '2026-11-22T10:00:00.000Z' }, { viewer: null, at: '2026-11-21T10:00:00.000Z' }] });
    await mount(<CardViewsCard />);
    expect(host?.querySelectorAll('li')).toHaveLength(2);
    act(() => root?.unmount()); host?.remove();
    api.listCardViews.mockResolvedValueOnce({ items: [] });
    await mount(<CardViewsCard />);
    expect(host?.textContent).toContain(i18n.t('employeeCard.views.empty'));
    act(() => root?.unmount()); host?.remove();
    api.listCardViews.mockRejectedValueOnce(new Error('x'));
    await mount(<CardViewsCard />);
    expect(host?.querySelector('[role="alert"]')).toBeTruthy();
  });
});
