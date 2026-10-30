import type { TFunction } from 'i18next';
import type { ChecklistSessionSummary } from '../../shared/api/types.js';
import { ChecklistSummaryExport } from './ChecklistSummaryExport.js';

/** PR 375: a session can go into the summary only when it is completed; the server enforces it too. */
export const canExportSummary = (session: ChecklistSessionSummary) => session.status === 'completed';

/** Batch action of the sessions list: one file for the selected observations of one checklist. */
export function ChecklistSummarySelection({ selected, t }: { selected: ChecklistSessionSummary[]; t: TFunction }) {
  const sheets = new Set(selected.map((session) => session.checklist.id));
  if (sheets.size > 1) {
    return <span role="status">{t('admin.checklists.sessions.summarySameChecklist', 'Select sessions of one checklist.')}</span>;
  }
  return <ChecklistSummaryExport sessionIds={selected.map((session) => session.id)} disabled={false} t={t} />;
}
