import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LearnerAssessmentsPage } from './LearnerAssessmentsPage';
import { LearnerAssignmentsPage } from './LearnerAssignmentsPage';
import { LearnerCoursesPage } from './LearnerCoursesPage';

describe('learner page smoke rendering', () => {
  it('renders courses loading state without crashing', () => {
    const html = renderToStaticMarkup(<LearnerCoursesPage />);

    expect(html).toContain('role="status"');
  });

  it('renders assignments loading state without crashing', () => {
    const html = renderToStaticMarkup(<LearnerAssignmentsPage />);

    expect(html).toContain('role="status"');
  });

  it('renders assessments loading state without crashing', () => {
    const html = renderToStaticMarkup(<LearnerAssessmentsPage />);

    expect(html).toContain('role="status"');
  });
});
