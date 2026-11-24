import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';
import type { AssessmentAttemptSummary } from '../../shared/api/types.js';
import { apiRequest } from '../../shared/apiClient.js';
import { formatDate } from '../../shared/formatDate.js';
import { Button, DataTable, Dialog, PageState } from '../../shared/ui.js';
import type { Assessment } from './model.js';

export function AssessmentListResults({ assessment, close, t }: { assessment: Assessment; close: () => void; t: TFunction }) {
  const titleId = useId();
  const [results, setResults] = useState<AssessmentAttemptSummary[] | null>(null);
  const [error, setError] = useState(false);
  const { id } = assessment;
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<AssessmentAttemptSummary[]>(`/assessments/${encodeURIComponent(id)}/results`, { signal: controller.signal })
      .then((rows) => { if (!controller.signal.aborted) setResults(rows); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [id]);
  const title = t('admin.results.assessmentResultsTitle');
  return <Dialog open labelledBy={titleId} onClose={close}>
    <h2 id={titleId}>{title} · {assessment.title}</h2>
    {error && <PageState variant="error" message={t('admin.assessmentBuilder.list.resultsError')} />}
    {!error && !results && <PageState variant="loading" message={t('admin.assessmentBuilder.loading')} />}
    {results && <DataTable label={title} rows={results} keyExtractor={(row) => row.id}
      responsiveDetails={{ label: t('courses.details'), expandLabel: () => title, collapseLabel: () => title }}
      emptyMessage={t('admin.results.noResults')}
      columns={[
        { key: 'date', label: t('admin.assessmentBuilder.list.lastAttempt'), priority: 'primary', render: (row) => row.completedAt ? formatDate(row.completedAt) : '—' },
        { key: 'score', label: t('admin.assessmentBuilder.list.score'), priority: 'primary', render: (row) => row.effectiveResult
          ? <>{row.percentage}%<br />{t('assessments.policy.effective', { policy: t(`assessments.policy.${row.effectiveResult.policy}`), percentage: row.effectiveResult.percentage })}</>
          : `${row.percentage}%` },
        { key: 'status', label: t('admin.assessmentBuilder.col.status'), priority: 'primary', render: (row) =>
          t(row.status === 'in_progress' ? 'admin.assessmentBuilder.list.inProgress' : row.passed ? 'admin.assessmentBuilder.list.passed' : 'admin.assessmentBuilder.list.failed') },
      ]} />}
    <div className="ds-dialog__actions"><Button variant="secondary" onClick={close}>{t('admin.assessmentBuilder.close')}</Button></div>
  </Dialog>;
}
