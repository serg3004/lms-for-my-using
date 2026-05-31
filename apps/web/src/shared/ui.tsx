import type { ReactNode } from 'react';

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

type StatusBadgeTone = 'neutral' | 'success' | 'danger';

type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusBadgeTone;
};

export function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`ui-status-badge ui-status-badge--${tone}`}>{children}</span>;
}
