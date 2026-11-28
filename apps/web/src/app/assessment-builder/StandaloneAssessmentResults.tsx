import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAssessmentPath, listAssessments } from '../../shared/api/assessments.js';
import type { AssessmentAttemptResult } from '../../shared/api/types.js';
import { apiRequest } from '../../shared/apiClient.js';
import { PageState } from '../../shared/ui.js';
import { useAsyncData } from '../../shared/useAsyncData.js';

export function StandaloneAssessmentResults({ assessmentId }: { assessmentId?: string }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false);
  const id = assessmentId ?? selected;
  const error = t('assessments.standalone.error');
  const { state: catalog } = useAsyncData(async () =>
    !open || assessmentId ? [] : (await listAssessments()).filter((assessment) => assessment.courseId === null),
  [open, assessmentId], { error, unauthenticated: error });
  const { state: results } = useAsyncData(async () =>
    open && id ? apiRequest<AssessmentAttemptResult[]>(`${getAssessmentPath(id)}/results?placementId=standalone`) : [],
  [open, id], { error, unauthenticated: error });

  return <details onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{t('assessments.standalone.results')}</summary>
    {open && <>
      {!assessmentId && catalog.status === 'loaded' && <label>
        {t('assessments.standalone.chooseAssessment')}
        <select className="ds-input" value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">{t('assessments.standalone.choose')}</option>
          {catalog.data.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.title}</option>)}
        </select>
      </label>}
      {(catalog.status === 'error' || results.status === 'error') && <PageState variant="error" message={error} />}
      {(catalog.status === 'loading' || results.status === 'loading') && <PageState variant="loading" message={t('assessments.loading')} />}
      {id && results.status === 'loaded' && (results.data.length ? <ul>
        {results.data.map((row) => <li key={row.id}>
          {[row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || row.user.email}
          {' · '}{row.status !== 'completed' ? t('assessments.statusAvailable') : row.assessment.mode === 'survey' ? t('assessments.survey.answered') : `${row.percentage}%`}
        </li>)}
      </ul> : <p>{t('assessments.standalone.noResults')}</p>)}
    </>}
  </details>;
}
