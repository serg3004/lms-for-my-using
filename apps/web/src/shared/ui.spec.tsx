import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Avatar, Badge, Button, Card, Input, ProgressBar, SearchInput, Spinner } from './ui';
import { EmptyState, PageState, StatusBadge } from './ui';
import { LearnerTopNav } from './learnerLayout';

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

describe('design system — Button', () => {
  it('renders primary button by default', () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toContain('ds-button--primary');
    expect(html).toContain('Save');
  });

  it('applies variant and size classes', () => {
    const html = renderToStaticMarkup(<Button variant="secondary" size="sm">Cancel</Button>);
    expect(html).toContain('ds-button--secondary');
    expect(html).toContain('ds-button--sm');
  });

  it('renders as disabled button', () => {
    const html = renderToStaticMarkup(<Button disabled>Disabled</Button>);
    expect(html).toContain('disabled');
  });
});

describe('design system — Badge', () => {
  it('renders neutral badge by default', () => {
    const html = renderToStaticMarkup(<Badge>Draft</Badge>);
    expect(html).toContain('ds-badge--neutral');
  });

  it('renders published badge', () => {
    const html = renderToStaticMarkup(<Badge variant="published">Published</Badge>);
    expect(html).toContain('ds-badge--published');
    expect(html).toContain('Published');
  });

  it('renders overdue badge', () => {
    const html = renderToStaticMarkup(<Badge variant="overdue">Overdue</Badge>);
    expect(html).toContain('ds-badge--overdue');
  });
});

describe('design system — Card', () => {
  it('renders card with children', () => {
    const html = renderToStaticMarkup(<Card><p>Content</p></Card>);
    expect(html).toContain('ds-card');
    expect(html).toContain('Content');
  });

  it('applies compact modifier', () => {
    const html = renderToStaticMarkup(<Card compact>Content</Card>);
    expect(html).toContain('ds-card--compact');
  });
});

describe('design system — Input', () => {
  it('renders label and input', () => {
    const html = renderToStaticMarkup(<Input id="name" label="Full name" />);
    expect(html).toContain('ds-input');
    expect(html).toContain('Full name');
    expect(html).toContain('for="name"');
  });

  it('renders error state', () => {
    const html = renderToStaticMarkup(<Input error="Required" />);
    expect(html).toContain('ds-input--error');
    expect(html).toContain('Required');
  });
});

describe('design system — SearchInput', () => {
  it('renders search icon and input', () => {
    const html = renderToStaticMarkup(
      <SearchInput value="" onChange={() => {}} placeholder="Search…" />,
    );
    expect(html).toContain('ds-search__input');
    expect(html).toContain('ds-search__icon');
  });
});

describe('design system — ProgressBar', () => {
  it('renders accessible progress bar', () => {
    const html = renderToStaticMarkup(<ProgressBar value={60} label="Progress" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="60"');
    expect(html).toContain('width:60%');
  });

  it('clamps value to 0–100', () => {
    const over = renderToStaticMarkup(<ProgressBar value={150} />);
    expect(over).toContain('width:100%');

    const under = renderToStaticMarkup(<ProgressBar value={-10} />);
    expect(under).toContain('width:0%');
  });
});

describe('design system — Avatar', () => {
  it('renders initials from first and last name', () => {
    const html = renderToStaticMarkup(<Avatar firstName="John" lastName="Doe" />);
    expect(html).toContain('JD');
    expect(html).toContain('ds-avatar--md');
  });

  it('uses only first initial when no last name', () => {
    const html = renderToStaticMarkup(<Avatar firstName="Admin" />);
    expect(html).toContain('A');
  });

  it('applies size class', () => {
    const html = renderToStaticMarkup(<Avatar firstName="A" size="lg" />);
    expect(html).toContain('ds-avatar--lg');
  });
});

describe('design system — Spinner', () => {
  it('renders accessible spinner', () => {
    const html = renderToStaticMarkup(<Spinner />);
    expect(html).toContain('role="status"');
    expect(html).toContain('ds-spinner--md');
  });

  it('applies size class', () => {
    const html = renderToStaticMarkup(<Spinner size="sm" />);
    expect(html).toContain('ds-spinner--sm');
  });
});

describe('design system — LearnerTopNav', () => {
  it('renders brand and logout button', () => {
    const html = renderToStaticMarkup(
      <LearnerTopNav
        brandLabel="LMS"
        firstName="Anna"
        lastName="Smith"
        onLogout={vi.fn()}
      />,
    );
    expect(html).toContain('LMS');
    expect(html).toContain('learner-topnav__brand');
    expect(html).toContain('learner-topnav__logout');
  });

  it('renders nav links with aria-current for active item', () => {
    const html = renderToStaticMarkup(
      <LearnerTopNav
        brandLabel="LMS"
        firstName="Anna"
        navItems={[
          { label: 'Courses', href: '/learn/courses', isCurrent: true },
          { label: 'Profile', href: '/learn/profile' },
        ]}
        onLogout={vi.fn()}
      />,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Courses');
    expect(html).toContain('Profile');
  });
});
