import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AuthorshipNote, isAnsweringPath } from './AuthorshipNote';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('AuthorshipNote', () => {
  it('shows the author line on ordinary pages', () => {
    expect(renderToStaticMarkup(<AuthorshipNote pathname="/learn" />)).toContain('app.authorship');
  });

  it('stays away from the pages where a person is answering', () => {
    expect(isAnsweringPath('/learn/assessments/a1/take')).toBe(true);
    expect(isAnsweringPath('/instructor/checklists/sessions/s1')).toBe(true);
    expect(isAnsweringPath('/instructor/checklists/sessions/all')).toBe(false);
    expect(isAnsweringPath('/instructor/checklists/sessions/all/s1')).toBe(false);
    expect(renderToStaticMarkup(<AuthorshipNote pathname="/learn/assessments/a1/take" />)).toBe('');
  });
});
