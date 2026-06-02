import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmptyState, PageState, StatusBadge } from './ui';

describe('shared UI state components', () => {
  it('renders StatusBadge with neutral tone by default', () => {
    const html = renderToStaticMarkup(<StatusBadge>draft</StatusBadge>);

    expect(html).toContain('ui-status-badge--neutral');
    expect(html).toContain('draft');
  });

  it('renders PageState loading as an accessible busy status', () => {
    const html = renderToStaticMarkup(<PageState message="Loading courses" variant="loading" />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading courses');
  });

  it('renders EmptyState through PageState info markup', () => {
    const html = renderToStaticMarkup(<EmptyState title="No items" message="Nothing to show yet" />);

    expect(html).toContain('role="status"');
    expect(html).toContain('No items');
    expect(html).toContain('Nothing to show yet');
  });
});
