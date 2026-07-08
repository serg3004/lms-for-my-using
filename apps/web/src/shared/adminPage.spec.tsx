import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminCard, AdminPageHeader, AdminPageLayout, ConfirmDialog, FormField } from './adminPage.js';

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

describe('FormField', () => {
  it('renders label with required asterisk and children', () => {
    const html = renderToStaticMarkup(
      <FormField id="name" label="Full name" required>
        <input id="name" type="text" />
      </FormField>,
    );

    expect(html).toContain('for="name"');
    expect(html).toContain('Full name *');
    expect(html).toContain('type="text"');
    expect(html).toContain('class="admin-form__field"');
  });

  it('renders error message with correct id and role', () => {
    const html = renderToStaticMarkup(
      <FormField id="email" label="Email" error="Email is required">
        <input id="email" type="email" />
      </FormField>,
    );

    expect(html).toContain('Email is required');
    expect(html).toContain('id="email-error"');
    expect(html).toContain('role="alert"');
  });

  it('renders hint when no error present', () => {
    const html = renderToStaticMarkup(
      <FormField id="slug" label="Slug" hint="Auto-generated from title">
        <input id="slug" type="text" />
      </FormField>,
    );

    expect(html).toContain('Auto-generated from title');
    expect(html).toContain('admin-form__hint');
  });
});

describe('ConfirmDialog', () => {
  it('renders title and message inside dialog element', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open={true}
        title="Delete item"
        message="This cannot be undone."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(html).toContain('Delete item');
    expect(html).toContain('This cannot be undone.');
    expect(html).toContain('<dialog');
  });

  it('renders danger confirm button when variant is danger', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open={true}
        title="Delete"
        message="Sure?"
        confirmLabel="Yes, delete"
        cancelLabel="No"
        variant="danger"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(html).toContain('admin-btn--danger');
    expect(html).toContain('Yes, delete');
    expect(html).toContain('No');
  });
});
