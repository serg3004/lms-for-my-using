// @vitest-environment jsdom
import '../i18n/index.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';

import { PasswordInput } from './PasswordInput';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; });

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(<PasswordInput id="p" autoComplete="new-password" defaultValue="secret" />); });
  return { input: container.querySelector('input')!, button: container.querySelector('button')! };
}

describe('PasswordInput', () => {
  it('hides the password by default and shows or hides it with the eye button', async () => {
    const { input, button } = await render();
    expect(input.type).toBe('password');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    await act(async () => { button.click(); });
    expect(input.type).toBe('text');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { button.click(); });
    expect(input.type).toBe('password');
  });

  it('passes the input attributes through and does not submit a form', async () => {
    const { input, button } = await render();
    expect(input.id).toBe('p');
    expect(input.autocomplete).toBe('new-password');
    expect(button.type).toBe('button');
  });

  it.each(['ru', 'en', 'kk', 'zh'])('labels the button in %s', async (locale) => {
    await i18n.changeLanguage(locale);
    const { button } = await render();
    expect(button.getAttribute('aria-label')).toBe(i18n.t('login.showPassword'));
    expect(button.getAttribute('aria-label')).not.toBe('login.showPassword');
  });
});
