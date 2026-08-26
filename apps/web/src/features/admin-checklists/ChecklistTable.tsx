import type { TFunction } from 'i18next';
import { AdminStatusSelect } from '../../shared/AdminStatusSelect.js';
import { Badge, DataTable, type Column } from '../../shared/ui.js';
import type { ChecklistScoringMode, ChecklistStatus, ChecklistSummary } from '../../shared/api/types.js';
import { CHECKLIST_STATUSES } from './domain.js';

export function ChecklistTable({ rows, statusLabels, scoringModeLabels, onStatusChange, onEdit, onDelete, t }: {
  rows: ChecklistSummary[];
  statusLabels: Record<ChecklistStatus, string>;
  scoringModeLabels: Record<ChecklistScoringMode, string>;
  onStatusChange: (checklist: ChecklistSummary, status: ChecklistStatus) => void | Promise<void>;
  onEdit: (checklist: ChecklistSummary) => void;
  onDelete: (checklist: ChecklistSummary) => void;
  t: TFunction;
}) {
  const columns = [
    { key: 'title', label: t('admin.checklists.col.title', 'Title'), render: (checklist) => checklist.title },
    { key: 'items', label: t('admin.checklists.col.items', 'Items'), render: (checklist) => checklist.items.length },
    { key: 'scoring', label: t('admin.checklists.col.scoring', 'Scoring'), render: (checklist) => <Badge variant="neutral">{scoringModeLabels[checklist.scoringMode]}</Badge> },
    { key: 'status', label: t('admin.checklists.col.status', 'Status'), render: (checklist) => <AdminStatusSelect value={checklist.status} statuses={CHECKLIST_STATUSES} labels={statusLabels} onChange={(status) => void onStatusChange(checklist, status)} /> },
    { key: 'actions', label: '', render: (checklist) => <div className="td-actions">
      <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => onEdit(checklist)}>{t('admin.checklists.edit', 'Edit')}</button>
      <button className="admin-btn admin-btn--sm admin-btn--danger" type="button" onClick={() => onDelete(checklist)}>{t('admin.checklists.delete', 'Delete')}</button>
    </div> },
  ] satisfies Column<ChecklistSummary>[];
  return <DataTable label={t('admin.checklists.title', 'Checklists')} columns={columns} rows={rows} keyExtractor={(checklist) => checklist.id} emptyMessage={t('admin.checklists.empty', 'No checklists found.')} />;
}
