// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ activateByIdentity: vi.fn() }));
vi.mock('../shared/api/auth.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../shared/api/auth.js')>()), ...api }));

import { ApiClientError } from '../shared/apiClient.js';
import { ActivatePage } from './ActivatePage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => {
  await i18n.changeLanguage('ru');
  api.activateByIdentity.mockReset().mockResolvedValue({ accepted: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MemoryRouter><ActivatePage /></MemoryRouter>));
});

const input = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
function type(id: string, value: string) {
  const element = input(id);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
  act(() => { element.dispatchEvent(new Event('input', { bubbles: true })); });
}
const submit = () => act(async () => { host?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });
function fill(password = 'Own-Pass7!', confirmation = password) {
  type('activate-organization', ' demo ');
  type('activate-number', ' 10245 ');
  type('activate-lastName', 'Каримова');
  type('activate-firstName', 'Айгуль');
  type('activate-password', password);
  type('activate-password-confirmation', confirmation);
}

describe('activation without email (PR 501)', () => {
  it('asks for every card field and does not send an empty form', async () => {
    await submit();
    expect(api.activateByIdentity).not.toHaveBeenCalled();
    expect(host?.querySelectorAll('[role="alert"]').length).toBeGreaterThanOrEqual(5);
  });

  it('checks that the two passwords match before sending', async () => {
    fill('Own-Pass7!', 'Other-Pass7!');
    await submit();
    expect(api.activateByIdentity).not.toHaveBeenCalled();
    expect(host?.textContent).toContain('Пароли не совпадают.');
  });

  it('sends the trimmed card data, leaves an empty middle name out and then offers the sign-in', async () => {
    fill();
    await submit();
    expect(api.activateByIdentity).toHaveBeenCalledWith({ organizationId: 'demo', employeeNumber: '10245', lastName: 'Каримова', firstName: 'Айгуль', password: 'Own-Pass7!' });
    expect(host?.textContent).toContain('Учётная запись активирована');
    expect(host?.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host?.querySelector('input')).toBeNull();
  });

  it('sends the middle name when it is given', async () => {
    fill();
    type('activate-middleName', 'Ахметовна');
    await submit();
    expect(api.activateByIdentity).toHaveBeenCalledWith(expect.objectContaining({ middleName: 'Ахметовна' }));
  });

  it('shows one "data not found" text for a refused identity and keeps the form', async () => {
    api.activateByIdentity.mockRejectedValue(new ApiClientError('Data not found', 400, { statusCode: 400, error: { code: 'BAD_REQUEST', message: 'Data not found' }, path: '/api/v1/auth/activate', timestamp: '2026-01-01T00:00:00.000Z' }));
    fill();
    await submit();
    expect(host?.textContent).toContain('Данные не найдены.');
    expect(input('activate-number').value).toBe(' 10245 ');
  });

  it('shows a general error for a failure that is not a refusal', async () => {
    api.activateByIdentity.mockRejectedValue(new Error('network'));
    fill();
    await submit();
    expect(host?.textContent).toContain('Не удалось активировать учётную запись.');
  });
});
