import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminCard, AdminPageHeader, AdminPageLayout } from './adminPage.js';

describe('admin page toolkit', () => {
  it('renders layout navigation and current item state', () => {
    const html = renderToStaticMarkup(
      <AdminPageLayout
        brandLabel="Admin"
        sidebarLabel="Admin navigation"
        navItems={[
          { label: 'Dashboard', href: '/admin' },
          { label: 'Users', href: '/admin/users', isCurrent: true },
        ]}
      >
        <AdminPageHeader title="Users" subtitle="Manage users" action={<a href="/admin">Back</a>} />
        <AdminCard>
          <p>User table</p>
        </AdminCard>
      </AdminPageLayout>,
    );

    expect(html).toContain('class="admin-layout"');
    expect(html).toContain('aria-label="Admin navigation"');
    expect(html).toContain('href="/admin/users"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Manage users');
    expect(html).toContain('class="admin-card"');
  });
});
