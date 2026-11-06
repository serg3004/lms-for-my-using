import { plainText } from '@lms/shared/rich-text';
import type { KeyboardEvent, ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { Badge, Button, DataTable, Menu, type BadgeVariant, type Column, type DataTableSort } from '../../shared/ui.js';
import type { ChecklistFolder, ChecklistScoringMode, ChecklistStatus, ChecklistSummary } from '../../shared/api/types.js';
import { folderAssignmentTotal, folderDirectCounts, folderPathLabel } from './folders.js';
import { formatDate } from '../../shared/formatDate.js';
import { ChecklistAccessBadge } from '../../shared/checklistAccess.js';
import { checklistStatusAction } from './domain.js';
import { ContextMenu, useContextMenu } from '../../shared/ContextMenu.js';

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

/**
 * PR 411: the blank space under the list also opens the "create" menu. The padding widens the hit area and the equal negative
 * margin keeps the page layout exactly as it was; later content paints over the padding, so it keeps its own clicks.
 */
const EMPTY_AREA_STYLE = { paddingBottom: 'min(40vh, 320px)', marginBottom: 'calc(-1 * min(40vh, 320px))' } as const;

/** PR 408: one row of the library: a folder of the open folder, or a checklist. Folders always come first. */
export type LibraryRow = { kind: 'folder'; key: string; folder: ChecklistFolder } | { kind: 'sheet'; key: string; checklist: ChecklistSummary };

export function ChecklistTable({ rows, statusLabels, scoringModeLabels, onStatusChange, onEdit, onCopy, onDelete, folders, onMove, selectedKeys, onSelectionChange, batchActions,
  childFolders, allSheets, showFolderPath, onOpenFolder, onRenameFolder, onMoveFolder, onDeleteFolder, onMoveSelection, onDeleteSelection, onCreateFolder, onCreateChecklist, canCreateFolder = true,
  emptyMessage, sort, onSortChange, t }: {
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
  /** PR 411: the context menu of a selection of several rows, and of the empty area of the list. */
  onMoveSelection?: (selection: { sheets: ChecklistSummary[]; folders: ChecklistFolder[] }) => void;
  onDeleteSelection?: (selection: { sheets: ChecklistSummary[]; folders: ChecklistFolder[] }) => void;
  onCreateFolder?: () => void;
  onCreateChecklist?: () => void;
  canCreateFolder?: boolean;
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
  // PR 411: right button / menu key / Shift+F10 / long press open the row menu; F2 and Delete act on the row without opening it.
  const menu = useContextMenu<{ kind: 'row'; key: string } | { kind: 'empty' }>();
  const rowsByKey = new Map(libraryRows.map((row) => [row.key, row]));
  /** A row outside the selection acts alone; a row inside it acts on the whole selection (as in file managers). */
  function actingRows(key: string): LibraryRow[] {
    const keys = selectedKeys?.has(key) ? [...selectedKeys] : [key];
    return keys.flatMap((id) => rowsByKey.get(id) ?? []);
  }
  function splitRows(picked: LibraryRow[]) {
    return {
      sheets: picked.flatMap((row) => (row.kind === 'sheet' ? [row.checklist] : [])),
      folders: picked.flatMap((row) => (row.kind === 'folder' ? [row.folder] : [])),
    };
  }
  function deleteRows(picked: LibraryRow[]) {
    const only = picked.length === 1 ? picked[0] : undefined;
    if (only?.kind === 'folder') { if (only.folder.canManage) onDeleteFolder?.(only.folder); }
    else if (only) onDelete(only.checklist);
    else if (picked.length > 1) onDeleteSelection?.(splitRows(picked));
  }
  function rowProps(row: LibraryRow) {
    const trigger = menu.triggerProps({ kind: 'row', key: row.key }, () => {
      if (selectedKeys && onSelectionChange && !selectedKeys.has(row.key)) onSelectionChange(new Set([row.key]));
    });
    return {
      ...trigger,
      tabIndex: 0,
      'data-row-key': row.key,
      onKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
        trigger.onKeyDown(event);
        if (event.defaultPrevented) return;
        const target = event.target as HTMLElement;
        // Only the row itself or its selection box: keys typed in a button or a field keep their own meaning.
        if (target !== event.currentTarget && !(target instanceof HTMLInputElement && target.type === 'checkbox')) return;
        const picked = actingRows(row.key);
        if (event.key === 'F2') {
          const only = picked.length === 1 ? picked[0] : undefined;
          if (only?.kind === 'folder' && only.folder.canManage && onRenameFolder) { event.preventDefault(); onRenameFolder(only.folder); }
        } else if (event.key === 'Delete') {
          event.preventDefault();
          deleteRows(picked);
        }
      },
    };
  }
  function contextMenuContent() {
    const target = menu.state?.target;
    if (!target) return { label: '', items: null };
    if (target.kind === 'empty') {
      return {
        label: t('admin.checklists.contextMenu.emptyLabel', 'Library actions'),
        items: (
          <>
            <button disabled={!canCreateFolder} onClick={() => onCreateFolder?.()} role="menuitem" type="button">{t('admin.checklists.createMenu.folder', 'Folder…')}</button>
            <button onClick={() => onCreateChecklist?.()} role="menuitem" type="button">{t('admin.checklists.createMenu.checklist', 'Checklist')}</button>
          </>
        ),
      };
    }
    const picked = actingRows(target.key);
    const only = picked.length === 1 ? picked[0] : undefined;
    if (!only) {
      const selection = splitRows(picked);
      return {
        label: t('admin.checklists.contextMenu.selectionLabel', 'Actions on the selection ({{selected}})', { selected: picked.length }),
        items: (
          <>
            {onMoveSelection && <button onClick={() => onMoveSelection(selection)} role="menuitem" type="button">{t('admin.checklists.contextMenu.moveSelection', 'Move the selection to a folder…')}</button>}
            {onDeleteSelection && <button onClick={() => onDeleteSelection(selection)} role="menuitem" type="button">{t('admin.checklists.contextMenu.deleteSelection', 'Delete the selection…')}</button>}
          </>
        ),
      };
    }
    if (only.kind === 'folder') {
      const folder = only.folder;
      return {
        label: t('admin.checklists.contextMenu.rowLabel', 'Actions: {{name}}', { name: folder.name }),
        items: (
          <>
            <button onClick={() => onOpenFolder?.(folder)} role="menuitem" type="button">{t('admin.checklists.folders.open', 'Open')}</button>
            {folder.canManage && <button onClick={() => onRenameFolder?.(folder)} role="menuitem" type="button">{t('admin.checklists.folders.renameFolder', 'Rename folder')}</button>}
            {folder.canManage && onMoveFolder && <button onClick={() => onMoveFolder(folder)} role="menuitem" type="button">{t('admin.checklists.folders.moveOpen', 'Move to folder…')}</button>}
            {folder.canManage && <button onClick={() => onDeleteFolder?.(folder)} role="menuitem" type="button">{t('admin.checklists.folders.delete', 'Delete')}</button>}
          </>
        ),
      };
    }
    const checklist = only.checklist;
    return {
      label: t('admin.checklists.contextMenu.rowLabel', 'Actions: {{name}}', { name: plainText(checklist.title) }),
      items: (
        <>
          <button onClick={() => onEdit(checklist)} role="menuitem" type="button">{t('admin.checklists.edit', 'Edit')}</button>
          <button onClick={() => void onCopy(checklist)} role="menuitem" type="button">{t('admin.checklists.copy', 'Copy')}</button>
          {checklist.status !== 'archived' && <button onClick={() => void onStatusChange(checklist, 'archived')} role="menuitem" type="button">{t('admin.checklists.action.archive', 'Archive')}</button>}
          {onMove && <button onClick={() => onMove(checklist)} role="menuitem" type="button">{t('admin.checklists.folders.moveOpen', 'Move to folder…')}</button>}
          <button onClick={() => onDelete(checklist)} role="menuitem" type="button">{t('admin.checklists.delete', 'Delete')}</button>
        </>
      ),
    };
  }
  const emptyAreaProps = onCreateFolder || onCreateChecklist ? { onContextMenu: menu.triggerProps({ kind: 'empty' }).onContextMenu } : {};
  const menuContent = contextMenuContent();
  const dash = '—';
  // PR 327: the status is a badge plus one explicit next-step button (not a free dropdown), so the
  // common transitions read as actions ("Publish") and archive/delete live behind the row menu.
  const statusActionLabels: Record<ChecklistStatus, string> = {
    published: t('admin.checklists.action.publish', 'Publish'),
    draft: t('admin.checklists.action.toDraft', 'Move to draft'),
    archived: t('admin.checklists.action.archive', 'Archive'),
  };
  const columns = [
    { key: 'title', label: t('admin.checklists.col.title', 'Title'), priority: 'primary', sortable: Boolean(onSortChange), render: (row) => row.kind === 'sheet' ? plainText(row.checklist.title) : (
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
  return <div {...emptyAreaProps} style={EMPTY_AREA_STYLE}><DataTable label={t('admin.checklists.title', 'Checklists')} columns={columns} rows={libraryRows} rowProps={rowProps}
    selection={selectedKeys && onSelectionChange ? {
      selectedKeys,
      onChange: onSelectionChange,
      selectedLabel: (count) => t('common.selectedCount', { count }),
      selectAllLabel: t('admin.checklists.bulk.selectAllRows', 'Select all folders and checklists in this folder'),
      rowLabel: (row) => row.kind === 'sheet' ? t('admin.checklists.bulk.selectRow', 'Select checklist: {{title}}', { title: plainText(row.checklist.title) }) : t('admin.checklists.bulk.selectFolderRow', 'Select folder: {{name}}', { name: row.folder.name }),
    } : undefined}
    batchActions={batchActions ? (selectedRows: LibraryRow[]) => batchActions({
      sheets: selectedRows.flatMap((row) => (row.kind === 'sheet' ? [row.checklist] : [])),
      folders: selectedRows.flatMap((row) => (row.kind === 'folder' ? [row.folder] : [])),
    }) : undefined}
    sort={sort} onSortChange={onSortChange}
    keyExtractor={(row) => row.key} emptyMessage={emptyMessage ?? t('admin.checklists.empty', 'No checklists found.')}
    responsiveDetails={{
      label: t('courses.details'),
      expandLabel: (row) => `${t('courses.details')}: ${row.kind === 'sheet' ? plainText(row.checklist.title) : row.folder.name}`,
      collapseLabel: (row) => `${t('courses.details')}: ${row.kind === 'sheet' ? plainText(row.checklist.title) : row.folder.name}`,
    }} />
    <ContextMenu label={menuContent.label} onClose={menu.close} state={menu.state}>{menuContent.items}</ContextMenu>
  </div>;
}
