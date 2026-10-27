import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChecklistSessionsToConduct } from './ChecklistSessionsToConduct.js';

export function ObserverSessionsBlock() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return <ChecklistSessionsToConduct hideEmpty onOpenSession={(id) => navigate(`/instructor/checklists/sessions/${id}`)} t={t} />;
}
