import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PublicHomePage } from './PublicHomePage.js';

describe('PublicHomePage smoke', () => {
  it('renders the hero, progress preview, and feature cards', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>,
    );

    expect(html).toContain('LearnSpace');
    expect(html).toContain('public-home__hero-inner');
    expect(html).toContain('public-home__preview');
    expect(html).toContain('public-home__features');
    expect(html).toContain('id="features"');
    expect(html).toContain('href="/login"');
  });
});
