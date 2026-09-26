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
    expect(html).toContain('aria-label="Открыть навигацию"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('renders a real, interactive NotificationBell in the top header, not a static bell icon (PR 302 review fix)', () => {
    // Admins are the primary recipient of some notification types (e.g.
    // checklist_session_observer_unavailable) but previously had no in-app way to see them --
    // AdminPageLayout rendered only a non-interactive `<span>🔔</span>`, while the real
    // NotificationBell component was mounted solely in LearnerPageLayout under /learn.
    const html = renderLayout();

    expect(html).toContain('class="notification-bell"');
    expect(html).toContain('class="notification-bell__btn"');
    expect(html).not.toContain('class="admin-topheader__bell"');
  });

  it('renders sidebar close button', () => {
    const html = renderLayout();

    expect(html).toContain('aria-label="Закрыть навигацию"');
    expect(html).toContain('class="admin-sidebar-close"');
  });
});

describe('admin shell navigation (UI refresh PR 310)', () => {
  function renderAt(currentPath: string, navItems: readonly { label: string; href: string; isCurrent?: boolean }[] = []) {
    return renderToStaticMarkup(
      <AdminPageLayout
        brandLabel="Admin"
        currentPath={currentPath}
        currentUser={{ firstName: 'Admin', lastName: 'Demo', email: 'admin@demo.com' }}
        navItems={navItems}
        sidebarLabel="Admin navigation"
      >
        <p>Page</p>
      </AdminPageLayout>,
    );
  }

  function activeSidebarHrefs(html: string) {
    return [...html.matchAll(/aria-current="page" class="admin-nav-link" href="([^"]+)"/g)].map((match) => match[1]);
  }

  function breadcrumbText(html: string) {
    const nav = html.match(/<nav aria-label="[^"]*" class="admin-breadcrumbs">(.*?)<\/nav>/)?.[1] ?? '';
    return [...nav.matchAll(/<li><(?:a|span)[^>]*>([^<]*)<\/(?:a|span)><\/li>/g)].map((match) => match[1]);
  }

  it('renders an icon for every sidebar destination', () => {
    const html = renderAt('/admin/users');

    expect(html.match(/class="admin-nav-link"/g)).toHaveLength(13);
    expect(html.match(/class="nav-icon"/g)).toHaveLength(13);
  });

  it('keeps Checklists active on nested session routes', () => {
    expect(activeSidebarHrefs(renderAt('/admin/checklists/sessions'))).toEqual(['/admin/checklists']);
    expect(activeSidebarHrefs(renderAt('/admin/checklists/sessions/session-1'))).toEqual(['/admin/checklists']);
  });

  it('marks the dashboard active only on its own route', () => {
    expect(activeSidebarHrefs(renderAt('/admin'))).toEqual(['/admin']);
    expect(activeSidebarHrefs(renderAt('/admin/users'))).toEqual(['/admin/users']);
  });

  it('builds breadcrumbs from the route, not from the page navItems', () => {
    const builderNavItems = [
      { label: 'Course builder', href: '/admin/courses' },
      { label: 'Assessment builder', href: '/admin/assessments' },
      { label: 'Checklists', href: '/admin/checklists', isCurrent: true },
    ];

    expect(breadcrumbText(renderAt('/admin/checklists', builderNavItems))).toEqual(['Управление', 'Чек-листы']);
    expect(breadcrumbText(renderAt('/admin/checklists/sessions'))).toEqual(['Управление', 'Чек-листы', 'Сессии']);
    expect(breadcrumbText(renderAt('/admin/checklists/sessions/session-1'))).toEqual(['Управление', 'Чек-листы', 'Сессии', 'Отчёт по сессии']);
    expect(breadcrumbText(renderAt('/admin/positions'))).toEqual(['Настройки', 'Организационная структура', 'Должности']);
  });

  it('shows the signed-in admin in the sidebar footer', () => {
    const html = renderAt('/admin/users');

    expect(html).toContain('class="admin-sidebar-user__name">Admin Demo');
    expect(html).toContain('class="admin-sidebar-user__email">admin@demo.com');
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
