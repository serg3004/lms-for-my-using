import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listCardViews } from '../../shared/api/employeeCard.js';
import { formatDate } from '../../shared/formatDate.js';

/** PR 507: the employee sees who lately opened their card by scanning the badge. */
export function CardViewsCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Array<{ viewer: string | null; at: string }> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { listCardViews().then((result) => setItems(result.items)).catch(() => setError(true)); }, []);

  if (!items && !error) return null;
  return (
    <section className={className} aria-labelledby="card-views-title">
      <h2 id="card-views-title">{t('employeeCard.views.title')}</h2>
      <p>{t('employeeCard.views.hint')}</p>
      {error ? <p role="alert">{t('employeeCard.views.loadError')}</p> : null}
      {items && items.length === 0 ? <p>{t('employeeCard.views.empty')}</p> : null}
      {items && items.length > 0 ? (
        <ul style={{ margin: 0 }}>
          {items.map((item, index) => <li key={`${item.at}-${index}`}>{item.viewer ?? t('employeeCard.views.unknown')}, {formatDate(item.at, undefined, { dateStyle: 'medium', timeStyle: 'short' })}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
