import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
/** PR 516: a compact two-way switch (not a second strip of tabs) under the section tabs. */
export function LibrarySwitch({ base, current }: { base: string; current: 'scales' | 'answer-sets' }) {
  const { t } = useTranslation();
  return <nav className="library-switch" aria-label={t('feedbackBuilder.libraries')}>
    <Link className="library-switch__option" aria-current={current === 'scales' ? 'page' : undefined} to={`${base}/scales`}>{t('admin.checklists.scaleManager.title')}</Link>
    <Link className="library-switch__option" aria-current={current === 'answer-sets' ? 'page' : undefined} to={`${base}/answer-sets`}>{t('feedbackBuilder.answerSets')}</Link>
  </nav>;
}
