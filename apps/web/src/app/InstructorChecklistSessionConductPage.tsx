import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { ChecklistSessionConduct } from './ChecklistSessionConduct.js';

/**
 * PR 319: the observer conducts a session on its own route
 * (`/instructor/checklists/sessions/:sessionId`) instead of local component state inside
 * InstructorChecklistReviewsPage.
 */
export function InstructorChecklistSessionConductPage({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <InstructorPageLayout>
      <div style={{ padding: '24px 0' }}>
        <ChecklistSessionConduct onBack={() => navigate('/instructor/checklists/sessions')} sessionId={sessionId} t={t} />
      </div>
    </InstructorPageLayout>
  );
}
