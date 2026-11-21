import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import '../i18n/index.js';
import { SessionProvider } from '../shared/session.js';
import { ForcedPasswordChange } from './ForcedPasswordChange.js';

describe('ForcedPasswordChange (PR 489)', () => {
  it('offers only the password change and signing out', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SessionProvider authenticated={false}>
          <ForcedPasswordChange />
        </SessionProvider>
      </MemoryRouter>,
    );

    expect(html).toContain('Задайте свой пароль');
    expect(html).toContain('id="change-current-password"');
    expect(html).toContain('type="submit">Сменить пароль');
    expect(html).toContain('type="button">Log out');
    expect(html).not.toContain('href=');
  });
});
