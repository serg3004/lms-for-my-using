import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { NotFoundPage } from './NotFoundPage.js';

describe('NotFoundPage smoke', () => {
  it('renders the 404 code, message, and both actions', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    expect(html).toContain('not-found-card__code">404');
    expect(html).toContain('<h1>Страница не найдена</h1>');
    expect(html).toContain('href="/"');
    expect(html).toContain('ds-button--primary');
    expect(html).toContain('ds-button--secondary');
  });
});
