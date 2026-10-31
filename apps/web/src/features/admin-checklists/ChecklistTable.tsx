import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { Badge, Button, DataTable, Menu, type BadgeVariant, type Column } from '../../shared/ui.js';
import type { ChecklistScoringMode, ChecklistStatus, ChecklistSummary } from '../../shared/api/types.js';
import { formatDate } from '../../shared/formatDate.js';
import { ChecklistAccessBadge } from '../../shared/checklistAccess.js';
import { checklistStatusAction } from './domain.js';

const STATUS_BADGE_VARIANT: Record<ChecklistStatus, BadgeVariant> = {
  draft: 'draft',
  published: 'published',
  archived: 'neutral',
};

/** PR 393: author's full name; a deleted or unnamed author reads as an em dash. */
export function creatorName(checklist: Pick<ChecklistSummary, 'creator'>): string {
  const name = [checklist.creator?.firstName, checklist.creator?.lastName].filter(Boolean).join(' ').trim();
  return name || '—';
}

export function ChecklistTable({ rows, statusLabels, scoringModeLabels, onStatusChange, onEdit, onCopy, onDelete, selectedKeys, onSelectionChange, batchActions, t }: {
  rows: ChecklistSummary[];
  statusLabels: Record<ChecklistStatus, string>;
  scoringModeLabels: Record<ChecklistScoringMode, string>;
  onStatusChange: (checklist: ChecklistSummary, status: ChecklistStatus) => void | Promise<void>;
  onEdit: (checklist: ChecklistSummary) => void;
  onCopy: (checklist: ChecklistSummary) => void | Promise<void>;
  onDelete: (checklist: ChecklistSummary) => void;
  // PR 394: row selection with a batch-actions bar; omitted -> the table has no checkboxes.
  selectedKeys?: ReadonlySet<string>;
  onSelectionChange?: (selectedKeys: Set<string>) => void;
  batchActions?: (selected: ChecklistSummary[]) => ReactNode;
  t: TFunction;
}) {
  // PR 327: the status is a badge plus one explicit next-step button (not a free dropdown), so the
  // common transitions read as actions ("Publish") and archive/delete live behind the row menu.
  const statusActionLabels: Record<ChecklistStatus, string> = {
    published: t('admin.checklists.action.publish', 'Publish'),
    draft: t('admin.checklists.action.toDraft', 'Move to draft'),
    archived: t('admin.checklists.action.archive', 'Archive'),
  };
  const columns = [
    { key: 'title', label: t('admin.checklists.col.title', 'Title'), priority: 'primary', render: (checklist) => checklist.title },
    { key: 'items', label: t('admin.checklists.col.items', 'Items'), priority: 'secondary', render: (checklist) => checklist.items.length },
    { key: 'access', label: t('admin.checklists.col.access', 'Access'), priority: 'secondary', render: (checklist) => <ChecklistAccessBadge checklist={checklist} t={t} /> },
    { key: 'scoring', label: t('admin.checklists.col.scoring', 'Scoring'), priority: 'secondary', render: (checklist) => <Badge variant="neutral">{scoringModeLabels[checklist.scoringMode]}</Badge> },
    { key: 'createdBy', label: t('admin.checklists.col.createdBy', 'Created by'), priority: 'secondary', render: (checklist) => creatorName(checklist) },
    { key: 'createdAt', label: t('admin.checklists.col.createdAt', 'Created'), priority: 'secondary', render: (checklist) => formatDate(checklist.createdAt, undefined, { dateStyle: 'medium', timeStyle: 'short' }) },
    {
      key: 'status',
      label: t('admin.checklists.col.status', 'Status'),
      priority: 'primary',
      render: (checklist) => {
        const next = checklistStatusAction(checklist.status);
        return (
          <div className="td-actions">
            <Badge variant={STATUS_BADGE_VARIANT[checklist.status]}>{statusLabels[checklist.status]}</Badge>
            <Button onClick={() => void onStatusChange(checklist, next)} size="sm" type="button" variant="secondary">
              {next === 'draft' && checklist.status === 'archived' ? t('admin.checklists.action.restore', 'Restore as draft') : statusActionLabels[next]}
            </Button>
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: '',
      priority: 'secondary',
      render: (checklist) => (
        <div className="td-actions">
          <Button onClick={() => onEdit(checklist)} size="sm" type="button" variant="secondary">{t('admin.checklists.edit', 'Edit')}</Button>
          <Button onClick={() => void onCopy(checklist)} size="sm" type="button" variant="secondary">{t('admin.checklists.copy', 'Copy')}</Button>
          <Menu
            align="end"
            buttonClassName="ds-button ds-button--secondary ds-button--sm"
            label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.rowActions', 'Actions')}</span></>}
          >
            {checklist.status !== 'archived' && (
              <button onClick={() => void onStatusChange(checklist, 'archived')} role="menuitem" type="button">
                {statusActionLabels.archived}
              </button>
            )}
            <button onClick={() => onDelete(checklist)} role="menuitem" type="button">{t('admin.checklists.delete', 'Delete')}</button>
          </Menu>
        </div>
      ),
    },
  ] satisfies Column<ChecklistSummary>[];
  return <DataTable label={t('admin.checklists.title', 'Checklists')} columns={columns} rows={rows}
    selection={selectedKeys && onSelectionChange ? {
      selectedKeys,
      onChange: onSelectionChange,
      selectedLabel: (count) => t('common.selectedCount', { count }),
      selectAllLabel: t('admin.checklists.bulk.selectAll', 'Select all checklists'),
      rowLabel: (checklist) => t('admin.checklists.bulk.selectRow', 'Select checklist: {{title}}', { title: checklist.title }),
    } : undefined}
    batchActions={batchActions}
    keyExtractor={(checklist) => checklist.id} emptyMessage={t('admin.checklists.empty', 'No checklists found.')} responsiveDetails={{ label: t('courses.details'), expandLabel: (checklist) => `${t('courses.details')}: ${checklist.title}`, collapseLabel: (checklist) => `${t('courses.details')}: ${checklist.title}` }} />;
}
