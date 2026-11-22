// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('../shared/api/auth.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../shared/api/auth.js')>()), ...api }));

import { LoginPage } from './LoginPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); localStorage.clear(); });
beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('ru');
  api.login.mockReset().mockResolvedValue({ user: { roles: ['learner'] } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MemoryRouter><LoginPage /></MemoryRouter>));
});

const tab = (name: string) => [...(host?.querySelectorAll('button[aria-pressed]') ?? [])].find((item) => item.textContent === name) as HTMLButtonElement;
const input = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
function type(id: string, value: string) {
  const element = input(id);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
  act(() => { element.dispatchEvent(new Event('input', { bubbles: true })); });
}
const submit = () => act(async () => { host?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 10)); });

describe('sign-in by employee number (PR 501)', () => {
  it('starts with the email form and links to the activation page', () => {
    expect(input('email')).not.toBeNull();
    expect(host?.querySelector('#employeeNumber')).toBeNull();
    expect(tab('По почте').getAttribute('aria-pressed')).toBe('true');
    expect(host?.querySelector('a[href="/activate"]')).not.toBeNull();
  });

  it('switches to number and last name and sends them with the password, never the email', async () => {
    act(() => { tab('По табельному номеру').click(); });
    expect(host?.querySelector('#email')).toBeNull();
    type('organizationId', ' demo ');
    type('employeeNumber', ' 10245 ');
    type('lastName', 'Каримова');
    type('password', 'Own-Pass7!');
    await submit();
    expect(api.login).toHaveBeenCalledWith({ organizationId: 'demo', employeeNumber: '10245', lastName: 'Каримова', password: 'Own-Pass7!' });
    expect(localStorage.getItem('lms-remembered-login')).toBeNull();
  });

  it('requires the number and the last name in this mode', async () => {
    act(() => { tab('По табельному номеру').click(); });
    type('organizationId', 'demo');
    type('password', 'Own-Pass7!');
    await submit();
    expect(api.login).not.toHaveBeenCalled();
    expect(host?.querySelector('#employeeNumber-error')).not.toBeNull();
    expect(host?.querySelector('#lastName-error')).not.toBeNull();
  });
});
