import type { TFunction } from 'i18next';

import type { ChecklistAccessMode } from './api/types.js';

/** PR 355: the label is derived from `accessMode` and `pinned`, never stored. */
export type ChecklistAccessKind = 'assigned' | 'free' | 'pinned';

export function checklistAccessKind(checklist: { accessMode?: ChecklistAccessMode; pinned?: boolean }): ChecklistAccessKind {
  if (checklist.accessMode !== 'free') return 'assigned';
  return checklist.pinned ? 'pinned' : 'free';
}

// Three distinct tones, all with text at least 4.5:1 against their background (WCAG AA at badge size).
const TONE: Record<ChecklistAccessKind, { color: string; background: string }> = {
  assigned: { color: '#92400e', background: '#fff7e8' },
  free: { color: '#166534', background: '#e9f8f2' },
  pinned: { color: '#3730a3', background: '#e0e7ff' },
};

export function checklistAccessLabel(kind: ChecklistAccessKind, t: TFunction): string {
  switch (kind) {
    case 'pinned': return t('checklists.access.pinned', 'On the panel');
    case 'free': return t('checklists.access.free', 'Free access');
    default: return t('checklists.access.assigned', 'By assignment');
  }
}

/** A separate badge: it never replaces the completion status ("Completed") or the publication status. */
export function ChecklistAccessBadge({ checklist, t }: { checklist: { accessMode?: ChecklistAccessMode; pinned?: boolean }; t: TFunction }) {
  const kind = checklistAccessKind(checklist);
  const tone = TONE[kind];
  return (
    <span data-access-kind={kind} style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, lineHeight: 1.4, borderRadius: 999, padding: '2px 10px', color: tone.color, background: tone.background, whiteSpace: 'nowrap' }}>
      {checklistAccessLabel(kind, t)}
    </span>
  );
}
