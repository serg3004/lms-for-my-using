import type { ReactNode } from 'react';

export type AdminNavItem = {
  label: string;
  href: string;
  isCurrent?: boolean;
};

type AdminPageLayoutProps = {
  brandLabel: string;
  sidebarLabel: string;
  navItems: readonly AdminNavItem[];
  children: ReactNode;
};

export function AdminPageLayout({ brandLabel, sidebarLabel, navItems, children }: AdminPageLayoutProps) {
  return (
    <main className="admin-layout">
      <aside className="admin-sidebar" aria-label={sidebarLabel}>
        <a className="admin-brand" href="/admin">
          {brandLabel}
        </a>
        <nav className="admin-nav">
          {navItems.map((item) => (
            <a
              aria-current={item.isCurrent ? 'page' : undefined}
              className="admin-nav-link"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <section className="admin-shell">{children}</section>
    </main>
  );
}

type AdminPageHeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function AdminPageHeader({ title, subtitle, action }: AdminPageHeaderProps) {
  return (
    <header className="admin-topbar">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

type AdminCardProps = {
  children: ReactNode;
};

export function AdminCard({ children }: AdminCardProps) {
  return <article className="admin-card">{children}</article>;
}
