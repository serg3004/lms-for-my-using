import type { TFunction } from 'i18next';

import type { ChecklistAccessMode } from './api/types.js';

/** PR 355: the label is derived from `accessMode` and `pinned`, never stored. */
export type ChecklistAccessKind = 'assigned' | 'free' | 'pinned';

export function checklistAccessKind(checklist: { accessMode?: ChecklistAccessMode; pinned?: boolean }): ChecklistAccessKind {
  if (checklist.accessMode !== 'free') return 'assigned';
  return checklist.pinned ? 'pinned' : 'free';
}

// Three distinct tones taken from the theme tokens, so every theme (including high contrast) keeps the text readable.
const TONE: Record<ChecklistAccessKind, { color: string; background: string }> = {
  assigned: { color: 'var(--color-warning-text)', background: 'var(--color-warning-bg)' },
  free: { color: 'var(--color-success)', background: 'var(--color-success-bg)' },
  pinned: { color: 'var(--color-accent-strong)', background: 'var(--color-accent-soft)' },
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
