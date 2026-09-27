import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { ChecklistSessionsToConduct } from './ChecklistSessionsToConduct.js';

/**
 * PR 319: the observer's "sessions to conduct" list, on its own route
 * (`/instructor/checklists/sessions`) instead of a tab embedded in
 * InstructorChecklistReviewsPage (the review-queue page, a separate concern).
 */
export function InstructorChecklistSessionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <InstructorPageLayout>
      <div style={{ padding: '24px 0', maxWidth: 640 }}>
        <p style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--color-primary)' }}>
          {t('checklistSessions.conduct.eyebrow', 'Workplace training')}
        </p>
        <h1 style={{ margin: '0 0 4px' }}>{t('checklistSessions.conduct.sessionsTitle', 'Sessions to conduct')}</h1>
        <p style={{ margin: '0 0 20px', color: 'var(--color-text-muted)' }}>
          {t('checklistSessions.conduct.sessionsSubtitle', 'Sessions where you are the observer.')}
        </p>
        <ChecklistSessionsToConduct onOpenSession={(sessionId) => navigate(`/instructor/checklists/sessions/${sessionId}`)} t={t} />
      </div>
    </InstructorPageLayout>
  );
}
