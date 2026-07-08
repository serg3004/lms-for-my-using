import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Avatar } from './ui.js';

export type AdminNavItem = {
  label: string;
  href: string;
  isCurrent?: boolean;
};

type AdminSidebarSection = {
  label: string;
  items: readonly { label: string; href: string }[];
};

const ADMIN_NAV: readonly AdminSidebarSection[] = [
  {
    label: 'Управление',
    items: [
      { label: 'Дашборд', href: '/admin' },
      { label: 'Курсы', href: '/admin/courses' },
      { label: 'Уроки', href: '/admin/lessons' },
      { label: 'Материалы', href: '/admin/materials' },
      { label: 'Тесты', href: '/admin/assessments' },
      { label: 'Пользователи', href: '/admin/users' },
      { label: 'Назначения', href: '/admin/assignments' },
      { label: 'Результаты', href: '/admin/results' },
    ],
  },
  {
    label: 'Настройки',
    items: [
      { label: 'Структура орг.', href: '/admin/org-structure' },
      { label: 'Роли', href: '/admin/roles' },
      { label: 'Оформление', href: '/admin/theme-settings' },
    ],
  },
] as const;

type AdminPageLayoutProps = {
  brandLabel: string;
  sidebarLabel: string;
  navItems: readonly AdminNavItem[];
  currentUser?: { firstName: string; lastName?: string; email: string };
  children: ReactNode;
};

export function AdminPageLayout({
  brandLabel,
  sidebarLabel,
  navItems,
  currentUser,
  children,
}: AdminPageLayoutProps) {
  const [isOpen, setIsOpen] = useState(false);

  const currentHrefs = new Set(
    navItems.filter((item) => item.isCurrent).map((item) => item.href),
  );

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
            <span className="admin-brand__logo">{brandLabel[0]}</span>
            <span className="admin-brand__text">
              <span>{brandLabel}</span>
              <span className="admin-brand__role">Admin Panel</span>
            </span>
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
          {ADMIN_NAV.map((section) => (
            <div className="admin-nav-section" key={section.label}>
              <div className="admin-nav-section-label">{section.label}</div>
              {section.items.map((item) => (
                <a
                  aria-current={currentHrefs.has(item.href) ? 'page' : undefined}
                  className="admin-nav-link"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        {currentUser ? (
          <div className="admin-sidebar-footer">
            <div className="admin-sidebar-user">
              <Avatar
                firstName={currentUser.firstName}
                lastName={currentUser.lastName}
                size="sm"
              />
              <div className="admin-sidebar-user__info">
                <div className="admin-sidebar-user__name">
                  {[currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ')}
                </div>
                <div className="admin-sidebar-user__email">{currentUser.email}</div>
              </div>
            </div>
          </div>
        ) : null}
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

// ── FormField ─────────────────────────────────────────────────────────────────

type FormFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function FormField({ id, label, required, hint, error, children }: FormFieldProps) {
  return (
    <div className="admin-form__field">
      <label htmlFor={id}>
        {label}{required ? ' *' : ''}
      </label>
      {children}
      {hint && !error ? <span className="admin-form__hint">{hint}</span> : null}
      {error ? (
        <p className="admin-form__field-error" id={`${id}-error`} role="alert">{error}</p>
      ) : null}
    </div>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
};

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);

  return (
    <dialog className="admin-dialog" ref={ref} onClose={onCancel}>
      <div className="admin-dialog__header">
        <h2>{title}</h2>
        <button
          aria-label={cancelLabel}
          className="admin-dialog__close"
          onClick={onCancel}
          type="button"
        >
          ✕
        </button>
      </div>
      <div className="admin-form">
        <p style={{ margin: 0, color: 'var(--color-text)' }}>{message}</p>
        <div className="admin-form__actions">
          <button className="admin-btn admin-btn--secondary" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            className={`admin-btn ${variant === 'danger' ? 'admin-btn--danger' : 'admin-btn--primary'}`}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
