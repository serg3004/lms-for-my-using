import { useEffect, useState, type ReactNode } from 'react';

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
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <main className="admin-layout">
      <div className="admin-mobile-bar">
        <button
          aria-expanded={isOpen}
          aria-label="Open navigation"
          className="admin-hamburger"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          ☰
        </button>
        <span className="admin-mobile-brand">{brandLabel}</span>
      </div>

      {isOpen && (
        <div
          aria-hidden="true"
          className="admin-drawer-backdrop"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        aria-label={sidebarLabel}
        className={`admin-sidebar${isOpen ? ' admin-sidebar--open' : ''}`}
      >
        <div className="admin-sidebar-header">
          <a className="admin-brand" href="/admin">
            {brandLabel}
          </a>
          <button
            aria-label="Close navigation"
            className="admin-sidebar-close"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            ✕
          </button>
        </div>
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
