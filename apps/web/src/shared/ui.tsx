import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from 'react';

type SkipLinkProps = { label: string; targetId?: string };

export function SkipLink({ label, targetId = 'main-content' }: SkipLinkProps) {
  function focusTarget() {
    const target = document.getElementById(targetId);
    if (!target) return;

    target.focus();
    target.scrollIntoView();
  }

  return (
    <a
      className="ui-skip-link"
      href={`#${targetId}`}
      onClick={(event) => {
        event.preventDefault();
        focusTarget();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;

        event.preventDefault();
        focusTarget();
      }}
    >
      {label}
    </a>
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
   Design system components (PR 142) — ds-* prefix
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

const AVATAR_PALETTE = ['#2563eb', '#047857', '#7c3aed', '#c2410c', '#db2777'];

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
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
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

// ── DataTable ────────────────────────────────────────────────────────────────

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  priority?: 'primary' | 'secondary' | 'tertiary';
};

export type DataTableSort = {
  key: string;
  direction: 'ascending' | 'descending';
};

export type DataTableSelection<T> = {
  selectedKeys: ReadonlySet<string>;
  onChange: (selectedKeys: Set<string>) => void;
  isRowSelectable?: (row: T) => boolean;
  selectAllLabel?: string;
  rowLabel?: (row: T) => string;
};

export type DataTableExpansion<T> = {
  expandedKeys: ReadonlySet<string>;
  onChange: (expandedKeys: Set<string>) => void;
  render: (row: T) => ReactNode;
  expandLabel?: (row: T) => string;
  collapseLabel?: (row: T) => string;
};

export type DataTableProps<T> = {
  label: string;
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  density?: 'default' | 'compact' | 'dense';
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  selection?: DataTableSelection<T>;
  batchActions?: ReactNode | ((selectedRows: T[]) => ReactNode);
  expansion?: DataTableExpansion<T>;
};

export function DataTable<T>({
  label,
  columns,
  rows,
  keyExtractor,
  emptyMessage = 'No items.',
  loading = false,
  loadingMessage = 'Loading…',
  density = 'default',
  sort,
  onSortChange,
  selection,
  batchActions,
  expansion,
}: DataTableProps<T>) {
  if (loading) {
    return <PageState message={loadingMessage} variant="loading" />;
  }

  if (rows.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  const selectableRows = selection ? rows.filter((row) => selection.isRowSelectable?.(row) !== false) : [];
  const selectedRows = selection ? rows.filter((row) => selection.selectedKeys.has(keyExtractor(row))) : [];
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selection?.selectedKeys.has(keyExtractor(row)));
  const columnSpan = columns.length + (selection ? 1 : 0) + (expansion ? 1 : 0);

  function updateSelection(key: string, selected: boolean) {
    if (!selection) return;
    const next = new Set(selection.selectedKeys);
    if (selected) next.add(key);
    else next.delete(key);
    selection.onChange(next);
  }

  function updateExpansion(key: string, expanded: boolean) {
    if (!expansion) return;
    const next = new Set(expansion.expandedKeys);
    if (expanded) next.add(key);
    else next.delete(key);
    expansion.onChange(next);
  }

  return (
    <div className={`ds-data-table ds-data-table--${density}`}>
      {selection && batchActions && selectedRows.length > 0 ? (
        <div className="ds-data-table__batch-actions" role="region" aria-label={`${selectedRows.length} selected`}>
          <span aria-live="polite">{selectedRows.length} selected</span>
          {typeof batchActions === 'function' ? batchActions(selectedRows) : batchActions}
        </div>
      ) : null}
      <TableWrap>
        <table aria-label={label}>
          <thead>
            <tr>
              {selection ? (
                <th className="ds-data-table__control" scope="col">
                  <input
                    aria-label={selection.selectAllLabel ?? 'Select all rows'}
                    checked={allSelected}
                    onChange={(event) => {
                      const next = new Set(selection.selectedKeys);
                      selectableRows.forEach((row) => {
                        const key = keyExtractor(row);
                        if (event.currentTarget.checked) next.add(key);
                        else next.delete(key);
                      });
                      selection.onChange(next);
                    }}
                    type="checkbox"
                  />
                </th>
              ) : null}
              {expansion ? (
                <th className="ds-data-table__control" scope="col">
                  <span className="ui-visually-hidden">Details</span>
                </th>
              ) : null}
              {columns.map((col) => (
                <th aria-sort={col.sortable && sort?.key === col.key ? sort.direction : undefined} data-priority={col.priority} key={col.key}>
                  {col.sortable ? (
                    <button
                      className="ds-data-table__sort"
                      onClick={() => onSortChange?.({
                        key: col.key,
                        direction: sort?.key === col.key && sort.direction === 'ascending' ? 'descending' : 'ascending',
                      })}
                      type="button"
                    >
                      {col.label}
                      <span aria-hidden="true" className="ds-data-table__sort-icon">
                        {sort?.key === col.key ? (sort.direction === 'ascending' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  ) : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = keyExtractor(row);
              const selectable = selection?.isRowSelectable?.(row) !== false;
              const expanded = expansion?.expandedKeys.has(key) ?? false;
              return [
                <tr key={key}>
                  {selection ? (
                    <td className="ds-data-table__control">
                      <input
                        aria-label={selection.rowLabel?.(row) ?? `Select row ${key}`}
                        checked={selection.selectedKeys.has(key)}
                        disabled={!selectable}
                        onChange={(event) => updateSelection(key, event.currentTarget.checked)}
                        type="checkbox"
                      />
                    </td>
                  ) : null}
                  {expansion ? (
                    <td className="ds-data-table__control">
                      <button
                        aria-expanded={expanded}
                        aria-label={expanded ? expansion.collapseLabel?.(row) ?? `Collapse row ${key}` : expansion.expandLabel?.(row) ?? `Expand row ${key}`}
                        className="ds-data-table__expand"
                        onClick={() => updateExpansion(key, !expanded)}
                        type="button"
                      >
                        {expanded ? '−' : '+'}
                      </button>
                    </td>
                  ) : null}
                  {columns.map((col) => <td data-priority={col.priority} key={col.key}>{col.render(row)}</td>)}
                </tr>,
                expanded ? (
                  <tr className="ds-data-table__expanded" key={`${key}-expanded`}>
                    <td colSpan={columnSpan}>{expansion?.render(row)}</td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

type ToolbarProps = {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function Toolbar({ left, right, className }: ToolbarProps) {
  return (
    <div className={['admin-toolbar', className].filter(Boolean).join(' ')}>
      {left ? <div className="admin-toolbar__left">{left}</div> : null}
      {right ? <div className="admin-toolbar__right">{right}</div> : null}
    </div>
  );
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

/* ─────────────────────────────────────────────────────────────────────────
   Pagination
   ───────────────────────────────────────────────────────────────────────── */

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
};

export function Pagination({ page, pageSize, total, onPage }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="ds-pagination">
      <button
        className="ds-button ds-button--secondary ds-button--sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        type="button"
      >
        ← Prev
      </button>
      <span className="ds-pagination__info">{page} / {totalPages}</span>
      <button
        className="ds-button ds-button--secondary ds-button--sm"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        type="button"
      >
        Next →
      </button>
    </div>
  );
}
