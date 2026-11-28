import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { apiDownloadRequest, apiRequest, getAssessmentPath } from '../../shared/apiClient.js';
import { Card, PageState } from '../../shared/ui.js';
import { useAsyncData } from '../../shared/useAsyncData.js';
import { Bar } from '../SheetAnalyticsDashboard.js';

export type SurveyReportData = {
  assessment: { id: string; title: string };
  respondents: number;
  questions: {
    id: string; type: string; title: string; answered: number;
    options: { id: string; text: string | null; count: number; percent: number }[];
    texts: { attemptId: string; name: string; text: string }[];
  }[];
};

function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** PR 540: the report of a survey: how the answers are distributed per question, with the named free-text answers. */
export function SurveyReport({ assessmentId }: { assessmentId: string }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState(false);
  const error = t('surveyReport.error');
  const report = useAsyncData((signal) => apiRequest<SurveyReportData>(`${getAssessmentPath(assessmentId)}/survey-report`, { signal }),
    [assessmentId], { error, unauthenticated: error });

  async function download(format: 'xlsx' | 'pdf') {
    setBusy(true);
    setExportError(false);
    try {
      const language = (i18n.resolvedLanguage ?? 'en').split('-')[0]!;
      const locale = ['ru', 'kk', 'zh'].includes(language) ? language : 'en';
      const file = await apiDownloadRequest(`${getAssessmentPath(assessmentId)}/survey-report/export?${new URLSearchParams({ format, locale })}`);
      saveFile(file.blob, file.filename ?? `survey.${format}`);
    } catch {
      setExportError(true);
    } finally {
      setBusy(false);
    }
  }

  if (report.state.status === 'loading') return <PageState variant="loading" message={t('assessments.loading')} />;
  if (report.state.status !== 'loaded') {
    return <PageState variant="error" message={report.state.message}
      action={<button type="button" onClick={() => void report.reload()}>{t('assessmentAnalytics.retry')}</button>} />;
  }
  const data = report.state.data;
  return <section style={{ display: 'grid', gap: 16 }} data-testid="survey-report">
    <h2 style={{ margin: 0 }}>{data.assessment.title}</h2>
    <p style={{ margin: 0 }}>{t('surveyReport.respondents', { count: data.respondents })}</p>
    <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{t('surveyReport.notAnonymous')}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
      {(['xlsx', 'pdf'] as const).map((format) => <button key={format} className="ds-button ds-button--secondary" type="button" disabled={busy || !data.respondents}
        aria-label={t('assessmentExport.download', { format: format.toUpperCase() })} onClick={() => void download(format)}>{format.toUpperCase()}</button>)}
      {exportError && <span role="alert">{t('assessmentExport.error')}</span>}
    </div>
    {!data.respondents && <PageState variant="info" message={t('surveyReport.empty')} />}
    {data.respondents > 0 && data.questions.map((question, index) => <Card key={question.id}>
      <div style={{ display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, overflowWrap: 'anywhere' }}>{index + 1}. {question.title}</h3>
        <small>{t('surveyReport.answered', { count: question.answered })}</small>
        {question.options.map((option) => <Bar key={option.id} label={option.text || t('surveyReport.untitledOption')} value={option.percent}
          color="var(--color-primary)" hint={String(option.count)} />)}
        {question.type === 'short_answer' && (question.texts.length ? <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          {question.texts.map((answer) => <li key={answer.attemptId} style={{ overflowWrap: 'anywhere' }}><strong>{answer.name}:</strong> {answer.text}</li>)}
        </ul> : <p style={{ margin: 0 }}>{t('surveyReport.noTexts')}</p>)}
      </div>
    </Card>)}
  </section>;
}
