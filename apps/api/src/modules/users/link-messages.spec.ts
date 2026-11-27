import { describe, expect, it } from '@jest/globals';

import { linkTexts } from './link-messages.js';

const locales = ['ru', 'en', 'kk', 'zh'] as const;

describe('link messages', () => {
  it.each(locales)('has both texts in %s with the link and no secret', (locale) => {
    const texts = linkTexts(locale);
    const install = texts.install({ firstName: 'Айгуль', link: 'https://x.test/install' });
    const session = texts.session({ firstName: 'Айгуль', link: 'https://x.test/instructor/checklists/sessions/1' });
    expect(install).toContain('https://x.test/install');
    expect(session).toContain('/instructor/checklists/sessions/1');
    expect(install).toContain('Айгуль');
    expect(texts.installSubject.length).toBeGreaterThan(3);
    expect(texts.sessionSubject.length).toBeGreaterThan(3);
    expect(install + session).not.toMatch(/token=|парол|password|密码|құпиясөз/i);
  });

  it('falls back to Russian for an unknown language', () => {
    expect(linkTexts('de').installSubject).toBe(linkTexts('ru').installSubject);
  });
});
