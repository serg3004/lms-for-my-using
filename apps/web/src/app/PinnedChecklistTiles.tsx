import { plainText } from '@lms/shared/rich-text';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { FreeChecklistSummary } from '../shared/api/types.js';
import { ChecklistCover } from '../shared/ChecklistCover.js';
import { ChecklistAccessBadge } from '../shared/checklistAccess.js';
import { Card } from '../shared/ui.js';

/**
 * PR 354: the row of tiles for pinned free checklists, shared by the learner home and the checklists
 * page. PR 355: each tile carries the checklist picture (or the default illustration) and its
 * access badge.
 */
export function PinnedChecklistTiles({ items, title, action }: {
  items: FreeChecklistSummary[];
  title: string;
  action: (item: FreeChecklistSummary) => ReactNode;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <section aria-label={title} style={{ marginTop: 16, marginBottom: 8 }}>
      <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>{title}</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))' }}>
        {items.map((item) => (
          <li key={item.id} style={{ display: 'grid', minWidth: 0 }}>
            <Card compact style={{ display: 'grid', minWidth: 0 }}>
              <div style={{ display: 'grid', gap: 10, gridTemplateRows: 'auto 1fr auto auto', alignContent: 'stretch', minWidth: 0 }}>
                <ChecklistCover checklistId={item.id} coverUpdatedAt={item.coverUpdatedAt} title={plainText(item.title)} ratio="16 / 9" />
                <strong style={{ overflowWrap: 'anywhere', alignSelf: 'start' }}>{plainText(item.title)}</strong>
                <div><ChecklistAccessBadge checklist={{ accessMode: 'free', pinned: true }} t={t} /></div>
                {action(item)}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
