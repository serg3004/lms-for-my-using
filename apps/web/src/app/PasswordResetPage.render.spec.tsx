import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { passwordResetResources } from '../i18n/passwordResetResources.js';
import { PasswordResetPage } from './PasswordResetPage.js';

describe('PasswordResetPage', () => {
  it('renders the account-neutral request form', () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/password-reset']}><PasswordResetPage /></MemoryRouter>);

    expect(html).toContain('id="reset-organization"');
    expect(html).toContain('id="reset-email"');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('id="reset-password"');
  });

  it('renders the new-password form only when a plausible token is present', () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/password-reset?token=${'x'.repeat(43)}`]}><PasswordResetPage /></MemoryRouter>);

    expect(html).toContain('id="reset-password"');
    expect(html).toContain('id="reset-password-confirmation"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).not.toContain('id="reset-email"');
  });

  it('provides every reset state in all supported locales', () => {
    for (const locale of ['ru', 'en', 'kk', 'zh'] as const) {
      expect(passwordResetResources[locale].sent).toBeTruthy();
      expect(passwordResetResources[locale].invalid).toBeTruthy();
      expect(passwordResetResources[locale].success).toBeTruthy();
      expect(passwordResetResources[locale].passwordMismatch).toBeTruthy();
    }
  });
});
