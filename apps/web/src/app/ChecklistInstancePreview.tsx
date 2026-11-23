import { useState } from 'react';
import type { TFunction } from 'i18next';

import { ReportCriteria, ReportGroups, ReportHeader, ReportTotal } from '../features/admin-checklist-sessions/SessionReportView.js';
import { RichText } from '../shared/RichText.js';
import { ApiClientError } from '../shared/apiClient.js';
import { downloadChecklistInstanceReportPdf, getChecklistInstanceReport } from '../shared/api/checklists.js';
import { Button, InlineFeedback, PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { ChecklistTransferHistory } from './ChecklistTransfer.js';

/**
 * PR 478: the filled-in sheet as a report (the same object and view as the session report) with "Download PDF" and "Print".
 * Before the check is completed it shows the answers, comments and photos only: no points, percentage or verdict.
 */
export function ChecklistInstancePreview({ instanceId, onBack, t }: { instanceId: string; onBack: () => void; t: TFunction }) {
  const { state } = useAsyncData(
    () => getChecklistInstanceReport(instanceId),
    [instanceId],
    { unauthenticated: t('checklists.sessionExpired', 'Your session has expired. Please sign in again.'), error: t('checklists.instanceReport.loadError', 'Unable to load the report.') },
  );
  const [pdf, setPdf] = useState<{ status: 'idle' | 'loading' | 'error'; message?: string }>({ status: 'idle' });

  async function downloadPdf() {
    setPdf({ status: 'loading' });
    try {
      const { blob, filename } = await downloadChecklistInstanceReportPdf(instanceId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? `checklist-${instanceId}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setPdf({ status: 'idle' });
    } catch (err) {
      setPdf({ status: 'error', message: err instanceof ApiClientError ? err.message : t('checklists.instanceReport.pdfError', 'Unable to download the PDF.') });
    }
  }

  const back = (
    <button className="no-print" type="button" onClick={onBack} style={{ border: 'none', background: 'none', color: 'var(--color-primary, #4f46e5)', fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16, minHeight: 44 }}>
      ← {t('checklists.instanceReport.back', 'Back to the check')}
    </button>
  );
  if (state.status === 'loading') return <div>{back}<PageState message={t('checklists.loading', 'Loading checklists...')} variant="loading" /></div>;
  if (state.status !== 'loaded') return <div>{back}<PageState message={state.message || t('checklists.instanceReport.loadError', 'Unable to load the report.')} variant="error" /></div>;

  const report = state.data;
  if (!report.visible) return <div>{back}<PageState message={t('checklists.instanceReport.loadError', 'Unable to load the report.')} variant="error" /></div>;
  const answered = report.criteria.filter((criterion) => criterion.state === 'answered').length;
  const showPoints = report.pointsVisible !== false;
  return (
    <div>
      {back}
      <h1 style={{ marginBottom: 4 }}><RichText value={report.checklist.title} /></h1>
      <p style={{ color: 'var(--color-text-muted)', marginTop: 0 }}>{t('checklists.instanceReport.title', 'Preview of the filled-in sheet')}</p>
      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <Button type="button" variant="secondary" style={{ minHeight: 44 }} onClick={() => window.print()}>{t('checklists.instanceReport.print', 'Print')}</Button>
        <Button type="button" variant="secondary" style={{ minHeight: 44 }} disabled={pdf.status === 'loading'} onClick={() => void downloadPdf()}>
          {pdf.status === 'loading' ? t('checklists.instanceReport.pdfLoading', 'Preparing PDF…') : t('checklists.instanceReport.pdf', 'Download PDF')}
        </Button>
      </div>
      {pdf.status === 'error' && <InlineFeedback tone="error" title={t('checklists.instanceReport.pdfError', 'Unable to download the PDF.')}>{pdf.message}</InlineFeedback>}
      <ReportHeader report={report} t={t} />
      {report.summary === null ? (
        <p role="status" style={{ color: 'var(--color-text-muted)' }}>{t('checklists.instanceReport.notFinished', 'The check is not completed yet: points and the result are shown after it is completed.')}</p>
      ) : showPoints ? (
        <>
          <ReportTotal summary={report.summary} t={t} />
          {report.summary.scoringMode !== 'none' && <ReportGroups groups={report.groups} showNumbering={report.checklist.showNumbering} t={t} />}
        </>
      ) : report.summary.passed !== null && (
        <p style={{ fontWeight: 600 }}>{report.summary.passed ? t('checklists.passed', 'Passed') : t('checklists.notPassed', 'Not passed')}</p>
      )}
      {answered === 0
        ? <p>{t('checklists.instanceReport.empty', 'There are no answers yet.')}</p>
        : <ReportCriteria report={report} t={t} />}
      <ChecklistTransferHistory instanceId={instanceId} t={t} />
    </div>
  );
}
