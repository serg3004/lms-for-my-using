import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, SkipLink } from './ui.js';

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
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  function closeNavigation() {
    setIsOpen(false);
    menuButtonRef.current?.focus();
  }

  const currentHrefs = new Set(
    navItems.filter((item) => item.isCurrent).map((item) => item.href),
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const syncViewport = () => {
      const hidden = media.matches && !isOpen;
      sidebarRef.current?.toggleAttribute('inert', hidden);
      if (hidden) sidebarRef.current?.setAttribute('aria-hidden', 'true');
      else sidebarRef.current?.removeAttribute('aria-hidden');
    };
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <div className="admin-layout">
      <SkipLink label={t('a11y.skipToContent')} />
      <div className="admin-mobile-bar">
        <button
          aria-expanded={isOpen}
          aria-label="Open navigation"
          className="admin-hamburger"
          onClick={() => {
            setIsOpen(true);
            requestAnimationFrame(() => closeButtonRef.current?.focus());
          }}
          ref={menuButtonRef}
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
          onClick={closeNavigation}
        />
      )}

      <aside
        aria-label={sidebarLabel}
        className={`admin-sidebar${isOpen ? ' admin-sidebar--open' : ''}`}
        ref={sidebarRef}
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
            onClick={closeNavigation}
            ref={closeButtonRef}
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

      <main className="admin-shell" id="main-content" tabIndex={-1}>{children}</main>
    </div>
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
  const confirmRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      ref.current?.showModal();
      confirmRef.current?.focus();
    } else if (ref.current?.open) {
      ref.current.close();
    }
  }, [open]);

  function handleClose() {
    if (open) onCancel();
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  return (
    <dialog aria-labelledby={titleId} className="admin-dialog" ref={ref} onClose={handleClose}>
      <div className="admin-dialog__header">
        <h2 id={titleId}>{title}</h2>
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
            ref={confirmRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
