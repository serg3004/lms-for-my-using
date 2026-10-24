import type { TFunction } from 'i18next';
import { Badge, Button, DataTable, Menu, type BadgeVariant, type Column } from '../../shared/ui.js';
import type { ChecklistScoringMode, ChecklistStatus, ChecklistSummary } from '../../shared/api/types.js';
import { checklistStatusAction } from './domain.js';

const STATUS_BADGE_VARIANT: Record<ChecklistStatus, BadgeVariant> = {
  draft: 'draft',
  published: 'published',
  archived: 'neutral',
};

export function ChecklistTable({ rows, statusLabels, scoringModeLabels, onStatusChange, onEdit, onCopy, onDelete, t }: {
  rows: ChecklistSummary[];
  statusLabels: Record<ChecklistStatus, string>;
  scoringModeLabels: Record<ChecklistScoringMode, string>;
  onStatusChange: (checklist: ChecklistSummary, status: ChecklistStatus) => void | Promise<void>;
  onEdit: (checklist: ChecklistSummary) => void;
  onCopy: (checklist: ChecklistSummary) => void | Promise<void>;
  onDelete: (checklist: ChecklistSummary) => void;
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
    { key: 'scoring', label: t('admin.checklists.col.scoring', 'Scoring'), priority: 'secondary', render: (checklist) => <Badge variant="neutral">{scoringModeLabels[checklist.scoringMode]}</Badge> },
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
  return <DataTable label={t('admin.checklists.title', 'Checklists')} columns={columns} rows={rows} keyExtractor={(checklist) => checklist.id} emptyMessage={t('admin.checklists.empty', 'No checklists found.')} responsiveDetails={{ label: t('courses.details'), expandLabel: (checklist) => `${t('courses.details')}: ${checklist.title}`, collapseLabel: (checklist) => `${t('courses.details')}: ${checklist.title}` }} />;
}
