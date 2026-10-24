import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ChecklistSessionWizard } from '../features/admin-checklist-sessions/ChecklistSessionWizard.js';
import { useOptionalSession } from '../shared/session.js';
import { Button } from '../shared/ui.js';
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
  const currentUser = useOptionalSession()?.currentUser;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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
        {currentUser?.roles.includes('instructor') && <Button onClick={() => setWizardOpen(true)} style={{ marginBottom: 20, minHeight: 44 }}>
          {t('admin.checklists.sessions.create', 'New session')}
        </Button>}
        <ChecklistSessionsToConduct key={reloadKey} onOpenSession={(sessionId) => navigate(`/instructor/checklists/sessions/${sessionId}`)} t={t} />
      </div>
      {currentUser?.roles.includes('instructor') && <ChecklistSessionWizard
        fixedObserver={currentUser}
        onClose={() => setWizardOpen(false)}
        onCreated={() => setReloadKey((value) => value + 1)}
        open={wizardOpen} t={t}
      />}
    </InstructorPageLayout>
  );
}
