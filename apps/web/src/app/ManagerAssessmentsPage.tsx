import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listAssessments } from '../shared/api/assessments.js';
import type { AssessmentSummary } from '../shared/api/types.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { Button, DataTable, PageState, type Column } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { StandaloneAssessmentDialog } from './assessment-builder/StandaloneAssessmentDialog.js';

/** PR 585: the manager assigns published standalone tests to their own team and shares a link or QR (the API checks the team). */
export function ManagerAssessmentsPage() {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<AssessmentSummary | null>(null);
  const error = t('manager.assessments.loadError');
  const { state } = useAsyncData<AssessmentSummary[]>(
    async () => (await listAssessments()).filter((item) => item.courseId === null && item.status === 'published'),
    [t], { unauthenticated: error, error },
  );

  if (state.status === 'loading') return <ManagerPageLayout><PageState message={t('manager.assessments.loading')} variant="loading" /></ManagerPageLayout>;
  if (state.status !== 'loaded') return <ManagerPageLayout><PageState message={error} variant="error" /></ManagerPageLayout>;

  const columns: Column<AssessmentSummary>[] = [
    { key: 'title', label: t('manager.assessments.columnTitle'), priority: 'primary', render: (item) => item.mode === 'survey' ? `${item.title} · ${t('admin.assessmentBuilder.survey.survey')}` : item.title },
    { key: 'action', label: t('manager.assessments.columnAction'), priority: 'primary', render: (item) => <div className="td-actions">
      <Button variant="secondary" size="sm" type="button"
        onClick={() => { setSelected(item); dialog.current?.showModal(); }}>{t('manager.assessments.assign')}</Button>
      {item.mode === 'survey' && <a className="ds-button ds-button--secondary ds-button--sm" href={`/manager/reports/assessments/${encodeURIComponent(item.id)}`}>{t('surveyReport.open')}</a>}
    </div> },
  ];
  return <ManagerPageLayout>
    <div style={{ marginBottom: '22px' }}>
      <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)', fontWeight: 800 }}>{t('manager.assessments.title')}</h1>
      <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{t('manager.assessments.subtitle')}</p>
    </div>
    <DataTable columns={columns} density="dense" emptyMessage={t('manager.assessments.empty')} keyExtractor={(item) => item.id}
      label={t('manager.assessments.title')} rows={state.data}
      responsiveDetails={{ label: t('courses.details'), expandLabel: (item) => `${t('courses.details')}: ${item.title}`, collapseLabel: (item) => `${t('courses.details')}: ${item.title}` }} />
    <dialog ref={dialog} className="admin-dialog" onClose={() => setSelected(null)}>
      {selected && <StandaloneAssessmentDialog assessment={selected} dialog={dialog} manager />}
    </dialog>
  </ManagerPageLayout>;
}
