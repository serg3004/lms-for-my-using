import type { ReactNode } from 'react';

import type { FreeChecklistSummary } from '../shared/api/types.js';
import { Card } from '../shared/ui.js';

/** PR 354: the row of tiles for pinned free checklists, shared by the learner home and the checklists page. */
export function PinnedChecklistTiles({ items, title, action }: {
  items: FreeChecklistSummary[];
  title: string;
  action: (item: FreeChecklistSummary) => ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>{title}</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {items.map((item) => (
          <li key={item.id}>
            <Card compact>
              <div style={{ display: 'grid', gap: 10, height: '100%', alignContent: 'space-between' }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{item.title}</strong>
                {action(item)}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
