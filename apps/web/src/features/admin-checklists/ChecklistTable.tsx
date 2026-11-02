import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { Badge, Button, DataTable, Menu, type BadgeVariant, type Column, type DataTableSort } from '../../shared/ui.js';
import type { ChecklistFolder, ChecklistScoringMode, ChecklistStatus, ChecklistSummary } from '../../shared/api/types.js';
import { folderAssignmentTotal, folderDirectCounts, folderPathLabel } from './folders.js';
import { formatDate } from '../../shared/formatDate.js';
import { ChecklistAccessBadge } from '../../shared/checklistAccess.js';
import { checklistStatusAction } from './domain.js';

const STATUS_BADGE_VARIANT: Record<ChecklistStatus, BadgeVariant> = {
  draft: 'draft',
  published: 'published',
  archived: 'neutral',
};

/** PR 393: author's full name; a deleted or unnamed author reads as an em dash. */
export function creatorName(checklist: { creator?: { id?: string; firstName: string; lastName: string } | null }): string {
  const name = [checklist.creator?.firstName, checklist.creator?.lastName].filter(Boolean).join(' ').trim();
  return name || '—';
}

/** PR 408: one row of the library: a folder of the open folder, or a checklist. Folders always come first. */
export type LibraryRow = { kind: 'folder'; key: string; folder: ChecklistFolder } | { kind: 'sheet'; key: string; checklist: ChecklistSummary };

export function ChecklistTable({ rows, statusLabels, scoringModeLabels, onStatusChange, onEdit, onCopy, onDelete, folders, onMove, selectedKeys, onSelectionChange, batchActions,
  childFolders, allSheets, showFolderPath, onOpenFolder, onRenameFolder, onMoveFolder, onDeleteFolder, emptyMessage, sort, onSortChange, t }: {
  rows: ChecklistSummary[];
  statusLabels: Record<ChecklistStatus, string>;
  scoringModeLabels: Record<ChecklistScoringMode, string>;
  onStatusChange: (checklist: ChecklistSummary, status: ChecklistStatus) => void | Promise<void>;
  onEdit: (checklist: ChecklistSummary) => void;
  onCopy: (checklist: ChecklistSummary) => void | Promise<void>;
  onDelete: (checklist: ChecklistSummary) => void;
  // PR 396: with folders the table shows the folder path and the row menu offers "Move to folder".
  folders?: ChecklistFolder[];
  onMove?: (checklist: ChecklistSummary) => void;
  // PR 394/410: row selection (folders and checklists) with a batch-actions bar; omitted -> the table has no checkboxes.
  selectedKeys?: ReadonlySet<string>;
  onSelectionChange?: (selectedKeys: Set<string>) => void;
  /** PR 410: folders are selectable too; the bar gets the selected checklists and folders separately. */
  batchActions?: (selected: { sheets: ChecklistSummary[]; folders: ChecklistFolder[] }) => ReactNode;
  // PR 408: the subfolders of the open folder are shown above the checklists; `allSheets` feeds their counters.
  childFolders?: ChecklistFolder[];
  allSheets?: ChecklistSummary[];
  /** Search mode: a flat list across the library with the "Folder" (path) column. */
  showFolderPath?: boolean;
  onOpenFolder?: (folder: ChecklistFolder) => void;
  onRenameFolder?: (folder: ChecklistFolder) => void;
  onMoveFolder?: (folder: ChecklistFolder) => void;
  onDeleteFolder?: (folder: ChecklistFolder) => void;
  emptyMessage?: string;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  t: TFunction;
}) {
  const libraryRows: LibraryRow[] = [
    ...(childFolders ?? []).map((folder): LibraryRow => ({ kind: 'folder', key: `folder:${folder.id}`, folder })),
    ...rows.map((checklist): LibraryRow => ({ kind: 'sheet', key: checklist.id, checklist })),
  ];
  const sheetsForCounts = allSheets ?? rows;
  const dash = '—';
  // PR 327: the status is a badge plus one explicit next-step button (not a free dropdown), so the
  // common transitions read as actions ("Publish") and archive/delete live behind the row menu.
  const statusActionLabels: Record<ChecklistStatus, string> = {
    published: t('admin.checklists.action.publish', 'Publish'),
    draft: t('admin.checklists.action.toDraft', 'Move to draft'),
    archived: t('admin.checklists.action.archive', 'Archive'),
  };
  const columns = [
    { key: 'title', label: t('admin.checklists.col.title', 'Title'), priority: 'primary', sortable: Boolean(onSortChange), render: (row) => row.kind === 'sheet' ? row.checklist.title : (
      <span className="checklist-library__folder">
        <span aria-hidden="true">📁</span>
        <button className="checklist-library__open" onClick={() => onOpenFolder?.(row.folder)} type="button" aria-label={t('admin.checklists.folders.openFolder', 'Open folder: {{name}}', { name: row.folder.name })}>{row.folder.name}</button>
        {!row.folder.visibleToStaff && (
          <span role="img" aria-label={t('admin.checklists.folders.closed', 'Closed folder: visible only to its creator and administrators')} title={t('admin.checklists.folders.closed', 'Closed folder: visible only to its creator and administrators')}>🔒</span>
        )}
      </span>
    ) },
    ...(childFolders ? [{ key: 'type', label: t('admin.checklists.col.type', 'Type'), priority: 'secondary' as const, render: (row: LibraryRow) => row.kind === 'folder' ? t('admin.checklists.folders.typeFolder', 'Folder') : t('admin.checklists.folders.typeChecklist', 'Checklist') }] : []),
    { key: 'items', label: t('admin.checklists.col.items', 'Items'), priority: 'secondary', render: (row) => {
      if (row.kind === 'sheet') return row.checklist.items.length;
      const counts = folderDirectCounts(folders ?? [], sheetsForCounts, row.folder.id);
      return t('admin.checklists.folders.contents', 'Folders: {{folders}}, checklists: {{sheets}}', counts);
    } },
    { key: 'assignments', label: t('admin.checklists.col.assignments', 'Assignments'), priority: 'secondary', align: 'end' as const, render: (row) => row.kind === 'sheet'
      ? row.checklist.assignmentCount ?? dash
      : folderAssignmentTotal(folders ?? [], sheetsForCounts, row.folder.id) } as Column<LibraryRow>,
    { key: 'access', label: t('admin.checklists.col.access', 'Access'), priority: 'secondary', render: (row) => row.kind === 'sheet' ? <ChecklistAccessBadge checklist={row.checklist} t={t} /> : dash },
    { key: 'scoring', label: t('admin.checklists.col.scoring', 'Scoring'), priority: 'secondary', render: (row) => row.kind === 'folder' ? dash : (
      <>
        <Badge variant="neutral">{scoringModeLabels[row.checklist.scoringMode]}</Badge>
        {row.checklist.hasModuleOverrides && <> <Badge variant="neutral">{t('admin.checklists.moduleSettings.badge', 'Own module settings')}</Badge></>}
      </>
    ) },
    ...(folders && showFolderPath ? [{ key: 'folder', label: t('admin.checklists.col.folder', 'Folder'), priority: 'secondary' as const, render: (row: LibraryRow) => row.kind === 'sheet' ? folderPathLabel(folders, row.checklist.folderId) || dash : dash }] : []),
    { key: 'createdBy', label: t('admin.checklists.col.createdBy', 'Created by'), priority: 'secondary', render: (row) => creatorName(row.kind === 'sheet' ? row.checklist : row.folder) },
    { key: 'createdAt', label: t('admin.checklists.col.createdAt', 'Created'), priority: 'secondary', sortable: Boolean(onSortChange), render: (row) => formatDate((row.kind === 'sheet' ? row.checklist : row.folder).createdAt, undefined, { dateStyle: 'medium', timeStyle: 'short' }) },
    {
      key: 'status',
      label: t('admin.checklists.col.status', 'Status'),
      priority: 'primary',
      render: (row) => {
        if (row.kind === 'folder') return dash;
        const checklist = row.checklist;
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
      render: (row) => {
        if (row.kind === 'folder') {
          const folder = row.folder;
          return (
            <div className="td-actions">
              <Menu
                align="end"
                buttonClassName="ds-button ds-button--secondary ds-button--sm"
                label={<><span aria-hidden="true">⋮</span><span className="ui-visually-hidden">{t('admin.checklists.folders.actions', 'Folder actions: {{name}}', { name: folder.name })}</span></>}
              >
                <button onClick={() => onOpenFolder?.(folder)} role="menuitem" type="button">{t('admin.checklists.folders.open', 'Open')}</button>
                {folder.canManage && <button onClick={() => onRenameFolder?.(folder)} role="menuitem" type="button">{t('admin.checklists.folders.renameFolder', 'Rename folder')}</button>}
                {folder.canManage && onMoveFolder && <button onClick={() => onMoveFolder(folder)} role="menuitem" type="button">{t('admin.checklists.folders.moveOpen', 'Move to folder…')}</button>}
                {folder.canManage && <button onClick={() => onDeleteFolder?.(folder)} role="menuitem" type="button">{t('admin.checklists.folders.delete', 'Delete')}</button>}
              </Menu>
            </div>
          );
        }
        const checklist = row.checklist;
        return (
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
              {onMove && <button onClick={() => onMove(checklist)} role="menuitem" type="button">{t('admin.checklists.folders.moveOpen', 'Move to folder…')}</button>}
              <button onClick={() => onDelete(checklist)} role="menuitem" type="button">{t('admin.checklists.delete', 'Delete')}</button>
            </Menu>
          </div>
        );
      },
    },
  ] satisfies Column<LibraryRow>[];
  return <DataTable label={t('admin.checklists.title', 'Checklists')} columns={columns} rows={libraryRows}
    selection={selectedKeys && onSelectionChange ? {
      selectedKeys,
      onChange: onSelectionChange,
      selectedLabel: (count) => t('common.selectedCount', { count }),
      selectAllLabel: t('admin.checklists.bulk.selectAllRows', 'Select all folders and checklists in this folder'),
      rowLabel: (row) => row.kind === 'sheet' ? t('admin.checklists.bulk.selectRow', 'Select checklist: {{title}}', { title: row.checklist.title }) : t('admin.checklists.bulk.selectFolderRow', 'Select folder: {{name}}', { name: row.folder.name }),
    } : undefined}
    batchActions={batchActions ? (selectedRows: LibraryRow[]) => batchActions({
      sheets: selectedRows.flatMap((row) => (row.kind === 'sheet' ? [row.checklist] : [])),
      folders: selectedRows.flatMap((row) => (row.kind === 'folder' ? [row.folder] : [])),
    }) : undefined}
    sort={sort} onSortChange={onSortChange}
    keyExtractor={(row) => row.key} emptyMessage={emptyMessage ?? t('admin.checklists.empty', 'No checklists found.')}
    responsiveDetails={{
      label: t('courses.details'),
      expandLabel: (row) => `${t('courses.details')}: ${row.kind === 'sheet' ? row.checklist.title : row.folder.name}`,
      collapseLabel: (row) => `${t('courses.details')}: ${row.kind === 'sheet' ? row.checklist.title : row.folder.name}`,
    }} />;
}
