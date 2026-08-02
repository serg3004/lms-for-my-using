import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ForbiddenPage } from './ForbiddenPage.js';

describe('ForbiddenPage smoke', () => {
  it('renders the 403 code, message, and both actions', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ForbiddenPage />
      </MemoryRouter>,
    );

    expect(html).toContain('forbidden-card__code">403');
    expect(html).toContain('<h1>Доступ запрещён</h1>');
    expect(html).toContain('href="/"');
    expect(html).toContain('ds-button--primary');
    expect(html).toContain('ds-button--secondary');
  });
});
