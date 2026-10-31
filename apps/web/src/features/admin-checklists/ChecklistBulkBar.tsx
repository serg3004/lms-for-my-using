import type { TFunction } from 'i18next';
import { Button } from '../../shared/ui.js';
import type { ChecklistBulkAction, ChecklistBulkResult, ChecklistBulkSkipReason, ChecklistSummary } from '../../shared/api/types.js';

/** Titles listed in the delete confirmation before the rest is summarized as "and N more". */
const LISTED_TITLES = 10;

export function bulkDeleteMessage(selected: Pick<ChecklistSummary, 'title'>[], t: TFunction): string {
  const listed = selected.slice(0, LISTED_TITLES).map((checklist) => `«${checklist.title}»`).join(', ');
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

export function ChecklistBulkBar({ selected, busy, onAction, onEdit, onCopy, t }: {
  selected: ChecklistSummary[];
  busy: boolean;
  onAction: (action: ChecklistBulkAction, selected: ChecklistSummary[]) => void;
  onEdit: (checklist: ChecklistSummary) => void;
  onCopy: (checklist: ChecklistSummary) => void | Promise<void>;
  t: TFunction;
}) {
  const single = selected.length === 1 ? selected[0] : null;
  return (
    <>
      <Button disabled={busy || !single} onClick={() => single && onEdit(single)} size="sm" type="button" variant="secondary">{t('admin.checklists.edit', 'Edit')}</Button>
      <Button disabled={busy || !single} onClick={() => single && void onCopy(single)} size="sm" type="button" variant="secondary">{t('admin.checklists.copy', 'Copy')}</Button>
      <Button disabled={busy} onClick={() => onAction('publish', selected)} size="sm" type="button" variant="secondary">{t('admin.checklists.action.publish', 'Publish')}</Button>
      <Button disabled={busy} onClick={() => onAction('draft', selected)} size="sm" type="button" variant="secondary">{t('admin.checklists.action.toDraft', 'Move to draft')}</Button>
      <Button disabled={busy} onClick={() => onAction('archive', selected)} size="sm" type="button" variant="secondary">{t('admin.checklists.action.archive', 'Archive')}</Button>
      <Button disabled={busy} onClick={() => onAction('delete', selected)} size="sm" type="button" variant="danger">{t('admin.checklists.delete', 'Delete')}</Button>
    </>
  );
}
