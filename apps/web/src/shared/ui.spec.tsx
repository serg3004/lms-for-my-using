import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Avatar, Badge, Button, Card, DataTable, Input, Pagination, ProgressBar, SearchInput, SkipLink, Spinner, Toolbar } from './ui';
import { EmptyState, PageState, StatusBadge } from './ui';
import { LearnerTopNav } from './learnerLayout';

function visitElements(node: ReactNode, visit: (element: ReactElement<Record<string, unknown>>) => void) {
  Children.forEach(node, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    visit(child);
    visitElements(child.props.children as ReactNode, visit);
  });
}

function findButtons(tree: ReactNode) {
  const buttons: ReactElement<Record<string, unknown>>[] = [];
  visitElements(tree, (element) => {
    if (element.type === 'button') buttons.push(element);
  });
  return buttons;
}

describe('shared UI state components', () => {
  it('renders a skip link targeting the main landmark', () => {
    const html = renderToStaticMarkup(<SkipLink label="Skip to content" />);

    expect(html).toContain('href="#main-content"');
    expect(html).toContain('Skip to content');
  });

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

describe('design system — DataTable', () => {
  type Item = { id: string; name: string; score: number };

  const columns = [
    { key: 'name', label: 'Name', render: (row: Item) => row.name },
    { key: 'score', label: 'Score', render: (row: Item) => row.score },
  ];

  it('renders column headers and row data', () => {
    const rows: Item[] = [
      { id: '1', name: 'Alice', score: 90 },
      { id: '2', name: 'Bob', score: 75 },
    ];

    const html = renderToStaticMarkup(
      <DataTable label="Assessment results" columns={columns} rows={rows} keyExtractor={(r) => r.id} />,
    );

    expect(html).toContain('<th>Name</th>');
    expect(html).toContain('aria-label="Assessment results"');
    expect(html).toContain('<th>Score</th>');
    expect(html).toContain('Alice');
    expect(html).toContain('90');
    expect(html).toContain('Bob');
  });

  it('renders empty state when rows array is empty', () => {
    const html = renderToStaticMarkup(
      <DataTable label="Assessment results" columns={columns} rows={[]} keyExtractor={(r) => r.id} emptyMessage="Nothing here." />,
    );

    expect(html).toContain('Nothing here.');
    expect(html).not.toContain('<table');
  });

  it('uses default empty message when none provided', () => {
    const html = renderToStaticMarkup(
      <DataTable label="Assessment results" columns={columns} rows={[]} keyExtractor={(r) => r.id} />,
    );

    expect(html).toContain('No items.');
  });
});

describe('design system — Toolbar', () => {
  it('renders left and right slots', () => {
    const html = renderToStaticMarkup(
      <Toolbar left={<span>Search</span>} right={<button type="button">Create</button>} />,
    );

    expect(html).toContain('admin-toolbar');
    expect(html).toContain('admin-toolbar__left');
    expect(html).toContain('admin-toolbar__right');
    expect(html).toContain('Search');
    expect(html).toContain('Create');
  });

  it('renders nothing for missing slots', () => {
    const html = renderToStaticMarkup(<Toolbar right={<button type="button">Go</button>} />);

    expect(html).not.toContain('admin-toolbar__left');
    expect(html).toContain('admin-toolbar__right');
  });
});

describe('design system — Pagination', () => {
  it('renders nothing when there is only one page', () => {
    const html = renderToStaticMarkup(<Pagination page={1} pageSize={20} total={10} onPage={vi.fn()} />);
    expect(html).toBe('');
  });

  it('renders page info and disables Prev on the first page', () => {
    const html = renderToStaticMarkup(<Pagination page={1} pageSize={20} total={100} onPage={vi.fn()} />);
    expect(html).toContain('1 / 5');
    expect(html).toContain('disabled=""');
  });

  it('calls onPage with the previous and next page numbers when clicked', () => {
    const onPage = vi.fn();
    const tree = Pagination({ page: 2, pageSize: 20, total: 100, onPage });
    const [prevButton, nextButton] = findButtons(tree);

    (prevButton.props.onClick as () => void)();
    (nextButton.props.onClick as () => void)();

    expect(onPage).toHaveBeenNthCalledWith(1, 1);
    expect(onPage).toHaveBeenNthCalledWith(2, 3);
  });

  it('disables Next on the last page', () => {
    const tree = Pagination({ page: 5, pageSize: 20, total: 100, onPage: vi.fn() });
    const [, nextButton] = findButtons(tree);
    expect(nextButton.props.disabled).toBe(true);
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
