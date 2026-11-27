import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChecklistSessionsToConduct } from './ChecklistSessionsToConduct.js';

/** `queueOnly`: the administrator's management page, which has its own table of every session. */
export function ObserverSessionsBlock({ queueOnly = false }: { queueOnly?: boolean } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return <ChecklistSessionsToConduct hideEmpty queueOnly={queueOnly} onOpenSession={(id) => navigate(`/instructor/checklists/sessions/${id}`)} t={t} />;
}
