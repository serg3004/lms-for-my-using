import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminCard, AdminPageHeader, AdminPageLayout } from './adminPage.js';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Users', href: '/admin/users', isCurrent: true },
] as const;

function renderLayout() {
  return renderToStaticMarkup(
    <AdminPageLayout
      brandLabel="Admin"
      sidebarLabel="Admin navigation"
      navItems={NAV_ITEMS}
    >
      <AdminPageHeader title="Users" subtitle="Manage users" action={<a href="/admin">Back</a>} />
      <AdminCard>
        <p>User table</p>
      </AdminCard>
    </AdminPageLayout>,
  );
}

describe('admin page toolkit', () => {
  it('renders layout navigation and current item state', () => {
    const html = renderLayout();

    expect(html).toContain('class="admin-layout"');
    expect(html).toContain('aria-label="Admin navigation"');
    expect(html).toContain('href="/admin/users"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Manage users');
    expect(html).toContain('class="admin-card"');
  });

  it('renders mobile hamburger button with aria-expanded false initially', () => {
    const html = renderLayout();

    expect(html).toContain('class="admin-mobile-bar"');
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('renders sidebar close button', () => {
    const html = renderLayout();

    expect(html).toContain('aria-label="Close navigation"');
    expect(html).toContain('class="admin-sidebar-close"');
  });
});
