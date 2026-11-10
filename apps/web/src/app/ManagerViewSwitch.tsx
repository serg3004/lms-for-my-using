import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/** Employees / Sheets switch of a manager: the old employee analytics stay on `/manager/checklists`. */
export function ManagerViewSwitch({ current }: { current: 'employees' | 'sheets' }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('sheetAnalytics.viewSwitch', 'Analytics view')} className="admin-org-tabs">
      <Link aria-current={current === 'employees' ? 'page' : undefined} className="admin-org-tabs__tab" to="/manager/checklists">{t('sheetAnalytics.viewEmployees', 'Employees')}</Link>
      <Link aria-current={current === 'sheets' ? 'page' : undefined} className="admin-org-tabs__tab" to="/manager/checklists/sheets">{t('sheetAnalytics.viewSheets', 'Checklists')}</Link>
    </nav>
  );
}
