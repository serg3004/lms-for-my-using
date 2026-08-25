import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LearnerPageLayout } from './learnerLayout.js';

describe('LearnerPageLayout mobile navigation', () => {
  it('renders four primary destinations and identifies a nested active route', () => {
    const html = renderToStaticMarkup(
      <LearnerPageLayout currentPath="/learn/courses/course-1">
        <p>Course</p>
      </LearnerPageLayout>,
    );

    expect(html).toContain('class="learner-mobile-nav"');
    expect(html).toMatch(/aria-label="(?:Learner navigation|Навигация ученика)"/);
    expect(html).toContain('href="/learn"');
    expect(html).toContain('href="/learn/courses"');
    expect(html).toContain('href="/learn/notifications"');
    expect(html).toContain('href="#learner-account-controls"');
    expect(html.match(/class="learner-mobile-nav__link"/g)).toHaveLength(4);
    expect(html).toMatch(/aria-current="page"[^>]*href="\/learn\/courses"/);
  });

  it('does not mark Home active for unrelated learner routes', () => {
    const html = renderToStaticMarkup(
      <LearnerPageLayout currentPath="/learn/notifications">
        <p>Notifications</p>
      </LearnerPageLayout>,
    );

    expect(html).toMatch(/aria-current="page"[^>]*href="\/learn\/notifications"/);
    expect(html).not.toMatch(/aria-current="page"[^>]*href="\/learn"/);
  });
});
