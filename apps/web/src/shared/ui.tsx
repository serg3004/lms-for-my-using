import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from 'react';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="ui-breadcrumbs" aria-label="Breadcrumbs">
      <ol>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1 || !item.href;

          return (
            <li key={`${item.label}-${index}`} aria-current={isCurrent ? 'page' : undefined}>
              {isCurrent ? <span>{item.label}</span> : <a href={item.href}>{item.label}</a>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type PageSkeletonProps = {
  title?: string;
  message?: string;
  rows?: number;
  action?: ReactNode;
};

export function PageSkeleton({ title, message, rows = 3, action }: PageSkeletonProps) {
  return (
    <section className="ui-state ui-state--loading" role="status" aria-busy="true">
      {title ? <h1>{title}</h1> : null}
      {message ? <p>{message}</p> : null}
      <div className="ui-skeleton-list" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div className="ui-skeleton-card" key={index}>
            <span className="ui-skeleton-line ui-skeleton-line--wide" />
            <span className="ui-skeleton-line" />
            <span className="ui-skeleton-line ui-skeleton-line--short" />
          </div>
        ))}
      </div>
      {action ? <div className="ui-state__action">{action}</div> : null}
    </section>
  );
}

type PageStateVariant = 'loading' | 'info' | 'error';

type PageStateProps = {
  title?: string;
  message: string;
  action?: ReactNode;
  variant?: PageStateVariant;
};

export function PageState({ title, message, action, variant = 'info' }: PageStateProps) {
  if (variant === 'loading') {
    return <PageSkeleton title={title} message={message} action={action} />;
  }

  return (
    <section className={`ui-state ui-state--${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      {title ? <h1>{title}</h1> : null}
      <p>{message}</p>
      {action ? <div className="ui-state__action">{action}</div> : null}
    </section>
  );
}

type EmptyStateProps = {
  title?: string;
  message: string;
  action?: ReactNode;
};

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return <PageState title={title} message={message} action={action} />;
}

/* ─────────────────────────────────────────────────────────────────────────
   Design system components (PR 163) — ds-* prefix
   ───────────────────────────────────────────────────────────────────────── */

// ── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: ButtonProps) {
  const cls = ['ds-button', `ds-button--${variant}`, `ds-button--${size}`, className].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = 'neutral' | 'published' | 'draft' | 'overdue' | 'done' | 'new' | 'warning';

type BadgeProps = {
  variant?: BadgeVariant;
  children: ReactNode;
  style?: CSSProperties;
};

export function Badge({ variant = 'neutral', children, style }: BadgeProps) {
  return <span className={`ds-badge ds-badge--${variant}`} style={style}>{children}</span>;
}

// ── Card ─────────────────────────────────────────────────────────────────────

type CardProps = {
  children: ReactNode;
  compact?: boolean;
  flat?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function Card({ children, compact, flat, className, style }: CardProps) {
  const cls = [
    'ds-card',
    compact ? 'ds-card--compact' : null,
    flat ? 'ds-card--flat' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <div className={cls} style={style}>{children}</div>;
}

// ── Input ────────────────────────────────────────────────────────────────────

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const inputCls = ['ds-input', error ? 'ds-input--error' : null, className].filter(Boolean).join(' ');
  return (
    <div className="ds-field">
      {label ? (
        <label className="ds-field__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <input id={id} className={inputCls} {...rest} />
      {hint && !error ? <span className="ds-field__hint">{hint}</span> : null}
      {error ? <span className="ds-field__error">{error}</span> : null}
    </div>
  );
}

// ── SearchInput ──────────────────────────────────────────────────────────────

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
  return (
    <div className={['ds-search', className].filter(Boolean).join(' ')}>
      <span aria-hidden="true" className="ds-search__icon">
        ⌕
      </span>
      <input
        className="ds-search__input"
        placeholder={placeholder}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── ProgressBar ──────────────────────────────────────────────────────────────

type ProgressBarSize = 'sm' | 'md' | 'lg';

type ProgressBarProps = {
  value: number;
  max?: number;
  size?: ProgressBarSize;
  label?: string;
};

export function ProgressBar({ value, max = 100, size = 'md', label }: ProgressBarProps) {
  const pct = Math.round(Math.min(100, Math.max(0, (value / max) * 100)));
  const cls = ['ds-progress', size !== 'md' ? `ds-progress--${size}` : null].filter(Boolean).join(' ');
  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={value}
      className={cls}
      role="progressbar"
    >
      <div className="ds-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────

type AvatarSize = 'sm' | 'md' | 'lg';

type AvatarProps = {
  firstName: string;
  lastName?: string;
  size?: AvatarSize;
};

const AVATAR_PALETTE = ['#2563eb', '#059669', '#7c3aed', '#ea580c', '#db2777'];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (name.charCodeAt(i) + ((h << 5) - h)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export function Avatar({ firstName, lastName, size = 'md' }: AvatarProps) {
  const initials = `${firstName[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <span
      aria-label={[firstName, lastName].filter(Boolean).join(' ')}
      className={`ds-avatar ds-avatar--${size}`}
      style={{ background: avatarColor(`${firstName}${lastName ?? ''}`) }}
    >
      {initials}
    </span>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: string | number;
  trend?: ReactNode;
};

export function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {trend ? <div className="stat-card__trend">{trend}</div> : null}
    </div>
  );
}

// ── StatsGrid ────────────────────────────────────────────────────────────────

type StatsGridProps = {
  children: ReactNode;
};

export function StatsGrid({ children }: StatsGridProps) {
  return <div className="stats-grid">{children}</div>;
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

type SectionHeaderProps = {
  title: string;
  actions?: ReactNode;
};

export function SectionHeader({ title, actions }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {actions ? <div className="section-header__right">{actions}</div> : null}
    </div>
  );
}

// ── TableWrap ─────────────────────────────────────────────────────────────────

type TableWrapProps = {
  children: ReactNode;
};

export function TableWrap({ children }: TableWrapProps) {
  return <div className="admin-table-wrap">{children}</div>;
}

// ── Spinner ──────────────────────────────────────────────────────────────────

type SpinnerSize = 'sm' | 'md' | 'lg';

type SpinnerProps = {
  size?: SpinnerSize;
  label?: string;
};

export function Spinner({ size = 'md', label = 'Loading…' }: SpinnerProps) {
  return <span aria-label={label} className={`ds-spinner ds-spinner--${size}`} role="status" />;
}

/* ─────────────────────────────────────────────────────────────────────────
   Legacy components — unchanged for backward compatibility
   ───────────────────────────────────────────────────────────────────────── */

type StatusBadgeTone = 'neutral' | 'success' | 'danger';

type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusBadgeTone;
};

export function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`ui-status-badge ui-status-badge--${tone}`}>{children}</span>;
}
