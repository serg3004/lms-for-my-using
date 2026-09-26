import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorkspaceLayout } from './workspaceLayout.js';

const commonProps = {
  brandHref: '/learn',
  roleLabel: 'Learner',
  navigation: [
    { href: '/learn', label: 'Home' },
    { href: '/learn/courses', label: 'Courses', isCurrent: true },
  ],
  navigationLabel: 'Main navigation',
  breadcrumbLabel: 'Breadcrumb',
  openNavigationLabel: 'Open navigation',
  closeNavigationLabel: 'Close navigation',
  skipLinkLabel: 'Skip to content',
};

describe('WorkspaceLayout', () => {
  it('renders shared landmarks, navigation state and readable content mode', () => {
    const html = renderToStaticMarkup(<WorkspaceLayout {...commonProps}><h1>Courses</h1></WorkspaceLayout>);

    expect(html).toContain('href="#main-content"');
    expect(html).toMatch(/aria-current="page"[^>]*href="\/learn\/courses"/);
    expect(html).toContain('class="workspace-shell workspace-shell--readable workspace-shell--comfortable"');
  });

  it('supports a fluid compact operational workspace', () => {
    const html = renderToStaticMarkup(
      <WorkspaceLayout {...commonProps} contentMode="fluid" density="compact"><table><tbody /></table></WorkspaceLayout>,
    );

    expect(html).toContain('workspace-shell--fluid workspace-shell--compact');
    expect(html).toContain('workspace-app--sidebar');
  });

  it('shows the shared LearnSpace brand with the role label and an icon per destination', () => {
    const html = renderToStaticMarkup(<WorkspaceLayout {...commonProps}><h1>Courses</h1></WorkspaceLayout>);

    expect(html).toContain('class="learner-sidebar__brand-name">LearnSpace');
    expect(html).toContain('class="learner-sidebar__brand-sub">Learner');
    expect(html.match(/class="nav-icon"/g)).toHaveLength(2);
    expect(html).toContain('data-icon="courses"');
  });

  it('renders breadcrumbs from the role and the current destination', () => {
    const html = renderToStaticMarkup(<WorkspaceLayout {...commonProps}><h1>Courses</h1></WorkspaceLayout>);

    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toMatch(/<li><span>Learner<\/span><\/li><li><span aria-current="page">Courses<\/span><\/li>/);
  });

  it('shows the signed-in user in the sidebar footer and keeps account actions for the mobile drawer', () => {
    const html = renderToStaticMarkup(
      <WorkspaceLayout {...commonProps} firstName="Anna" lastName="Smith" email="anna@example.com" accountActions={<button type="button">Log out</button>}>
        <h1>Courses</h1>
      </WorkspaceLayout>,
    );

    expect(html).toContain('class="learner-sidebar__user-name">Anna Smith');
    expect(html).toContain('class="learner-sidebar__user-email">anna@example.com');
    expect(html).toContain('class="learner-sidebar__mobile-actions"');
    expect(html).toContain('class="learner-header__account"');
  });

  it('renders a closed mobile menu button and a close button inside the drawer', () => {
    const html = renderToStaticMarkup(<WorkspaceLayout {...commonProps}><h1>Courses</h1></WorkspaceLayout>);

    expect(html).toMatch(/aria-expanded="false"[^>]*aria-label="Open navigation"[^>]*class="learner-header__menu"/);
    expect(html).toContain('aria-label="Close navigation"');
    expect(html).not.toContain('learner-sidebar--open');
  });
});
