import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
export function LibrarySwitch({ base, current }: { base: string; current: 'scales' | 'answer-sets' }) {
  const { t } = useTranslation();
  return <nav className="admin-org-tabs" aria-label={t('feedbackBuilder.libraries')}>
    <Link className="admin-org-tabs__tab" aria-current={current === 'scales' ? 'page' : undefined} to={`${base}/scales`}>{t('admin.checklists.scaleManager.title')}</Link>
    <Link className="admin-org-tabs__tab" aria-current={current === 'answer-sets' ? 'page' : undefined} to={`${base}/answer-sets`}>{t('feedbackBuilder.answerSets')}</Link>
  </nav>;
}
