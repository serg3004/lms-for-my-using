import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorkspaceLayout } from './workspaceLayout.js';

const commonProps = {
  brandHref: '/workspace',
  brandLabel: 'LMS',
  navigation: [{ href: '/workspace', label: 'Dashboard', isCurrent: true }],
  navigationLabel: 'Workspace navigation',
  skipLinkLabel: 'Skip to content',
};

describe('WorkspaceLayout', () => {
  it('renders shared landmarks, navigation state and readable content mode', () => {
    const html = renderToStaticMarkup(<WorkspaceLayout {...commonProps}><h1>Dashboard</h1></WorkspaceLayout>);

    expect(html).toContain('href="#main-content"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('class="workspace-shell workspace-shell--readable workspace-shell--comfortable"');
  });

  it('supports a fluid compact operational workspace', () => {
    const html = renderToStaticMarkup(
      <WorkspaceLayout {...commonProps} contentMode="fluid" density="compact"><table><tbody /></table></WorkspaceLayout>,
    );

    expect(html).toContain('workspace-shell--fluid workspace-shell--compact');
    expect(html).toContain('workspace-app--sidebar');
  });

  it('supports top navigation without changing destination contracts', () => {
    const html = renderToStaticMarkup(
      <WorkspaceLayout {...commonProps} variant="topbar"><h1>Courses</h1></WorkspaceLayout>,
    );

    expect(html).toContain('workspace-app--topbar');
    expect(html).toContain('href="/workspace"');
    expect(html).toContain('learner-topnav__nav');
  });
});
