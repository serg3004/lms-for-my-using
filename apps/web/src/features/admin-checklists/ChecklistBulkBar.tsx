import { plainText } from '@lms/shared/rich-text';
import type { TFunction } from 'i18next';
import { Button } from '../../shared/ui.js';
import type { ChecklistBulkAction, ChecklistBulkResult, ChecklistBulkSkipReason, ChecklistFolder, ChecklistFolderBulkResult, ChecklistFolderBulkSkipReason, ChecklistFolderDeleteImpact, ChecklistSummary } from '../../shared/api/types.js';

/** Titles listed in the delete confirmation before the rest is summarized as "and N more". */
const LISTED_TITLES = 10;

export function bulkDeleteMessage(selected: Pick<ChecklistSummary, 'title'>[], t: TFunction): string {
  const listed = selected.slice(0, LISTED_TITLES).map((checklist) => `«${plainText(checklist.title)}»`).join(', ');
  const rest = selected.length - LISTED_TITLES;
  return t('admin.checklists.bulk.deleteConfirm', 'Delete {{count}} checklist(s): {{titles}}? They disappear from the list and can no longer be assigned; completed results are kept. A checklist that has assignments in progress is not deleted but moved to drafts. This cannot be undone.', {
    count: selected.length,
    titles: rest > 0 ? `${listed} ${t('admin.checklists.bulk.andMore', 'and {{count}} more', { count: rest })}` : listed,
  });
}

/** "Done: N, skipped: M" plus one line per skipped checklist with the reason. */
export function bulkResultSummary(result: ChecklistBulkResult, titles: ReadonlyMap<string, string>, t: TFunction) {
  const reasonLabels: Record<ChecklistBulkSkipReason, string> = {
    not_found: t('admin.checklists.bulk.reason.not_found', 'not found'),
    forbidden: t('admin.checklists.bulk.reason.forbidden', 'only the author or an administrator can change it'),
    already_in_status: t('admin.checklists.bulk.reason.already_in_status', 'already has this status'),
    already_in_folder: t('admin.checklists.bulk.reason.already_in_folder', 'already in this folder'),
    has_active_assignments: t('admin.checklists.bulk.reason.has_active_assignments', 'has assignments in progress'),
    cannot_publish: t('admin.checklists.bulk.reason.cannot_publish', 'cannot be published: it has no criteria or uses an archived scale'),
    moved_to_draft: t('admin.checklists.bulk.reason.moved_to_draft', 'not deleted, moved to drafts: it has assignments in progress'),
  };
  return {
    headline: t('admin.checklists.bulk.result', 'Done: {{done}}, skipped: {{skipped}}', { done: result.done, skipped: result.skipped }),
    skipped: result.results.flatMap((outcome) => (outcome.result === 'skipped'
      ? [{ id: outcome.id, text: `«${titles.get(outcome.id) ?? outcome.id}»: ${reasonLabels[outcome.reason]}` }]
      : [])),
  };
}

export type BulkReport = { headline: string; skipped: Array<{ id: string; text: string }> };

/** PR 410: the same "Done: N, skipped: M" report for folders, with the folder reasons (rights, duplicate name, depth, cycle). */
export function folderBulkResultSummary(result: ChecklistFolderBulkResult, names: ReadonlyMap<string, string>, t: TFunction): BulkReport {
  const reasonLabels: Record<ChecklistFolderBulkSkipReason, string> = {
    not_found: t('admin.checklists.bulk.reason.not_found', 'not found'),
    forbidden: t('admin.checklists.bulk.reason.folderForbidden', 'only the creator of the folder or an administrator can change it'),
    name_conflict: t('admin.checklists.bulk.reason.name_conflict', 'a folder with this name already exists there'),
    too_deep: t('admin.checklists.bulk.reason.too_deep', 'folders can be nested at most 5 levels deep'),
    cycle: t('admin.checklists.bulk.reason.cycle', 'a folder cannot be moved into itself or into its subfolder'),
    already_in_folder: t('admin.checklists.bulk.reason.already_in_folder', 'already in this folder'),
    covered_by_parent: t('admin.checklists.bulk.reason.covered_by_parent', 'deleted together with its parent folder'),
  };
  return {
    headline: t('admin.checklists.bulk.result', 'Done: {{done}}, skipped: {{skipped}}', { done: result.done, skipped: result.skipped }),
    skipped: result.results.flatMap((outcome) => (outcome.result === 'skipped'
      ? [{ id: outcome.id, text: `${t('admin.checklists.bulk.folderWord', 'Folder')} «${names.get(outcome.id) ?? outcome.id}»: ${reasonLabels[outcome.reason]}` }]
      : [])),
  };
}

/** One report for a mixed selection: counts are summed, the reasons of both requests are listed together. */
export function mergeBulkReports(reports: BulkReport[], counts: Array<{ done: number; skipped: number }>, t: TFunction): BulkReport {
  const done = counts.reduce((sum, item) => sum + item.done, 0);
  const skipped = counts.reduce((sum, item) => sum + item.skipped, 0);
  return { headline: t('admin.checklists.bulk.result', 'Done: {{done}}, skipped: {{skipped}}', { done, skipped }), skipped: reports.flatMap((report) => report.skipped) };
}

/**
 * PR 410: the one confirmation for deleting a selection that contains folders, with the numbers up front:
 * folders with everything below them, checklists that go with them plus the selected ones, and the checklists
 * with assignments in progress that are kept as drafts at the root.
 */
export function selectionDeleteMessage(impact: ChecklistFolderDeleteImpact, selectedSheets: number, t: TFunction): string {
  const base = t('admin.checklists.bulk.deleteMixedConfirm', 'Delete the selection? Folders (with everything inside): {{folders}}, checklists: {{checklists}}. Completed results are kept. This cannot be undone.', {
    folders: impact.folders, checklists: impact.checklists + selectedSheets,
  });
  if (impact.movedToDraft.length === 0) return base;
  const titles = impact.movedToDraft.map((sheet) => `«${sheet.title}»`).join(', ');
  return `${base} ${t('admin.checklists.folders.deleteMoved', 'Checklists with assignments in progress are not deleted but moved to drafts at the root: {{titles}}.', { titles })}`;
}

export function ChecklistBulkBar({ selected, selectedFolders = [], busy, onAction, onMove, onEdit, onCopy, onRenameFolder, onDeleteSelection, onAnalytics, t }: {
  selected: ChecklistSummary[];
  /** PR 410: the selected folders; with any, only moving, deleting and (for exactly one) renaming apply. */
  selectedFolders?: ChecklistFolder[];
  busy: boolean;
  onAction: (action: ChecklistBulkAction, selected: ChecklistSummary[]) => void;
  /** PR 396/410: opens the folder choice for the whole selection; omitted when the screen has no folders. */
  onMove?: (selection: { sheets: ChecklistSummary[]; folders: ChecklistFolder[] }) => void;
  onEdit: (checklist: ChecklistSummary) => void;
  onCopy: (checklist: ChecklistSummary) => void | Promise<void>;
  /** PR 410: renames the single selected folder (the caller may change it). */
  onRenameFolder?: (folder: ChecklistFolder) => void;
  /** PR 410: deletes a selection that contains folders (one confirmation, one report). */
  onDeleteSelection?: (selection: { sheets: ChecklistSummary[]; folders: ChecklistFolder[] }) => void;
  /** PR 462: opens the analytics tab with the selected checklists; omitted where the role has no such tab. */
  onAnalytics?: (sheets: ChecklistSummary[]) => void;
  t: TFunction;
}) {
  const hasFolders = selectedFolders.length > 0;
  const single = !hasFolders && selected.length === 1 ? selected[0] : null;
  const singleFolder = selected.length === 0 && selectedFolders.length === 1 && selectedFolders[0]!.canManage ? selectedFolders[0]! : null;
  const unavailable = hasFolders ? t('admin.checklists.bulk.notForFolders', 'Not available for folders') : undefined;
  const selection = { sheets: selected, folders: selectedFolders };
  return (
    <>
      {singleFolder && onRenameFolder && <Button disabled={busy} onClick={() => onRenameFolder(singleFolder)} size="sm" type="button" variant="secondary">{t('admin.checklists.folders.renameFolder', 'Rename folder')}</Button>}
      <Button disabled={busy || !single} onClick={() => single && onEdit(single)} size="sm" title={unavailable} type="button" variant="secondary">{t('admin.checklists.edit', 'Edit')}</Button>
      <Button disabled={busy || !single} onClick={() => single && void onCopy(single)} size="sm" title={unavailable} type="button" variant="secondary">{t('admin.checklists.copy', 'Copy')}</Button>
      {onAnalytics && <Button disabled={busy || hasFolders || selected.length === 0} onClick={() => onAnalytics(selected)} size="sm" title={unavailable} type="button" variant="secondary">{t('admin.checklists.analytics', 'Analytics')}</Button>}
      {onMove && <Button disabled={busy} onClick={() => onMove(selection)} size="sm" type="button" variant="secondary">{t('admin.checklists.folders.moveOpen', 'Move to folder…')}</Button>}
      <Button disabled={busy || hasFolders} onClick={() => onAction('publish', selected)} size="sm" title={unavailable} type="button" variant="secondary">{t('admin.checklists.action.publish', 'Publish')}</Button>
      <Button disabled={busy || hasFolders} onClick={() => onAction('draft', selected)} size="sm" title={unavailable} type="button" variant="secondary">{t('admin.checklists.action.toDraft', 'Move to draft')}</Button>
      <Button disabled={busy || hasFolders} onClick={() => onAction('archive', selected)} size="sm" title={unavailable} type="button" variant="secondary">{t('admin.checklists.action.archive', 'Archive')}</Button>
      <Button disabled={busy} onClick={() => (hasFolders && onDeleteSelection ? onDeleteSelection(selection) : onAction('delete', selected))} size="sm" type="button" variant="danger">{t('admin.checklists.delete', 'Delete')}</Button>
      {hasFolders && <span className="ds-data-table__batch-hint" role="note">{t('admin.checklists.bulk.foldersHint', 'Edit, copy, publish, draft and archive are available only for a selection of checklists.')}</span>}
    </>
  );
}
