import { useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { ApiClientError } from '../../shared/apiClient.js';
import { exportChecklistSessionSummary, type ChecklistReportFormat } from '../../shared/api/checklistSessions.js';
import { downloadCsvFile } from '../../shared/downloadCsv.js';
import { downloadSummaryXlsx } from '../../shared/downloadSummaryXlsx.js';

export function ChecklistSummaryExport({ sessionIds, disabled, t }: { sessionIds: string[]; disabled: boolean; t: TFunction }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  async function download(format: ChecklistReportFormat) {
    if (lock.current || disabled || sessionIds.length === 0) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const data = await exportChecklistSessionSummary(sessionIds, format);
      if (format === 'xlsx') await downloadSummaryXlsx(data);
      else downloadCsvFile(data.filename, data.csv);
    } catch (cause) {
      const reason = cause instanceof ApiClientError ? cause.message : '';
      const message = reason === 'session_summary.row_limit' || reason === 'session_summary.observation_limit'
        ? t('admin.checklists.report.summaryLimit', 'The summary is too large. Select fewer observations.')
        : cause instanceof ApiClientError && (cause.status === 403 || cause.status === 404)
          ? t('admin.checklists.report.summaryUnavailable', 'The summary is no longer available or you do not have access.')
          : reason === 'session_summary.completed_only'
            ? t('admin.checklists.report.summaryCompletedOnly', 'Only completed sessions can be exported.')
            : reason === 'session_summary.one_checklist'
              ? t('admin.checklists.report.summaryOneChecklist', 'Select sessions of one checklist.')
              : t('admin.checklists.report.summaryExportError', 'Unable to download the summary. Try again.');
      setError(message);
    } finally { lock.current = false; setBusy(false); }
  }
  return <>
    <button className="admin-btn admin-btn--secondary" type="button" disabled={disabled || busy || sessionIds.length === 0} onClick={() => void download('xlsx')}>
      {t('admin.checklists.report.downloadSummaryXlsx', 'Download summary (Excel)')}
    </button>
    <button className="admin-btn admin-btn--secondary" type="button" disabled={disabled || busy || sessionIds.length === 0} onClick={() => void download('csv')}>
      {t('admin.checklists.report.downloadSummaryCsv', 'Download summary (CSV)')}
    </button>
    {busy && <span role="status">{t('admin.checklists.report.summaryExporting', 'Preparing summary…')}</span>}
    {error && <span role="alert">{error}</span>}
  </>;
}
