// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ openEmployeeCard: vi.fn(), markEmployeeCardChecked: vi.fn(), recordAnonymousScan: vi.fn(), loadEmployeeCardPhoto: vi.fn() }));
vi.mock('../shared/api/employeeCard.js', () => api);

import { ApiClientError } from '../shared/apiClient';
import { EmployeeCardPage } from './EmployeeCardPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
const token = 'C'.repeat(43);
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); window.history.replaceState(null, '', '/'); });
beforeEach(async () => { await i18n.changeLanguage('ru'); });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
async function show(hash = '') {
  window.history.replaceState(null, '', `/employee-card${hash}`);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MemoryRouter><EmployeeCardPage /></MemoryRouter>));
  await flush();
}
const card = {
  level: 'peer', detail: false, blocks: ['courses', 'certificates', 'checklists', 'clearance'],
  subject: { name: 'Анна Волкова', hasPhoto: true, position: 'Повар' },
  clearance: { ok: false, overdueCourses: 1, overdueChecklists: 0, revokedCertificates: 2 },
  courses: [{ title: 'Охрана труда', status: 'overdue', dueAt: '2026-01-01T00:00:00.000Z' }],
  certificates: [{ title: 'Гигиена', status: 'revoked', issuedAt: '2026-01-01T00:00:00.000Z' }],
  checklists: [{ title: 'Смена', status: 'done', passed: true, percentage: 90 }],
};

describe('EmployeeCardPage (PR 507)', () => {
  it('shows the card, removes the token from the address and marks it checked', async () => {
    api.openEmployeeCard.mockResolvedValue(card);
    api.loadEmployeeCardPhoto.mockResolvedValue('blob:photo');
    api.markEmployeeCardChecked.mockResolvedValue({ checked: true, at: 'now' });
    await show(`#${token}`);
    expect(window.location.hash).toBe('');
    expect(api.openEmployeeCard).toHaveBeenCalledWith(token);
    expect(host?.textContent).toContain('Анна Волкова');
    expect(host?.textContent).toContain('Охрана труда');
    expect(host?.textContent).toContain('Гигиена');
    expect(host?.textContent).toContain('Смена');
    expect(host?.querySelector('img')?.getAttribute('src')).toBe('blob:photo');
    const button = [...(host?.querySelectorAll('button') ?? [])].find((item) => item.className.includes('login-form__submit')) as HTMLButtonElement;
    await act(async () => button.click());
    await flush();
    expect(api.markEmployeeCardChecked).toHaveBeenCalledWith(token);
    expect(host?.querySelector('[role="status"]:last-of-type')).toBeTruthy();
  });

  it('shows the inspector card with the pass only', async () => {
    api.openEmployeeCard.mockResolvedValue({ level: 'inspector', detail: false, blocks: ['clearance'], subject: { name: 'Иван', hasPhoto: false }, clearance: { ok: true } });
    await show(`#${token}`);
    expect(host?.textContent).toContain('Иван');
    expect(api.loadEmployeeCardPhoto).not.toHaveBeenCalled();
  });

  it('without a session shows only a warning and logs the scan', async () => {
    api.openEmployeeCard.mockRejectedValue(new ApiClientError('Unauthorized', 401));
    api.recordAnonymousScan.mockResolvedValue({ recorded: true });
    await show(`#${token}`);
    expect(api.recordAnonymousScan).toHaveBeenCalledWith(token);
    expect(host?.textContent).toContain('😬');
    expect(host?.querySelector('a')?.getAttribute('href')).toBe('/login');
  });

  it.each([[404, 'notFound'], [403, 'notAllowed'], [500, 'error']])('maps %i to a message', async (status) => {
    api.openEmployeeCard.mockRejectedValue(new ApiClientError('x', status));
    await show(`#${token}`);
    expect(host?.querySelector('[role="alert"]')).toBeTruthy();
    expect(api.recordAnonymousScan).not.toHaveBeenCalled();
  });

  it('asks for a link when there is no token and accepts a pasted link', async () => {
    api.openEmployeeCard.mockResolvedValue(card);
    api.loadEmployeeCardPhoto.mockResolvedValue('blob:photo');
    await show();
    const input = host?.querySelector('#employee-card-link') as HTMLInputElement;
    const set = (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await set('nonsense');
    await act(async () => (host?.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(host?.querySelector('[role="alert"]')).toBeTruthy();
    expect(api.openEmployeeCard).not.toHaveBeenCalled();
    await set(`https://x.test/badge#${token}`);
    await act(async () => (host?.querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(api.openEmployeeCard).toHaveBeenCalledWith(token);
  });
});
