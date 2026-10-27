import type { TFunction } from 'i18next';

import type { ChecklistAccessMode } from './api/types.js';
import { Badge, type BadgeVariant } from './ui.js';

/** PR 355: the label is derived from `accessMode` and `pinned`, never stored. */
export type ChecklistAccessKind = 'assigned' | 'free' | 'pinned';

export function checklistAccessKind(checklist: { accessMode?: ChecklistAccessMode; pinned?: boolean }): ChecklistAccessKind {
  if (checklist.accessMode !== 'free') return 'assigned';
  return checklist.pinned ? 'pinned' : 'free';
}

const VARIANT: Record<ChecklistAccessKind, BadgeVariant> = { assigned: 'neutral', free: 'info', pinned: 'accent' };

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
  return <Badge variant={VARIANT[kind]}>{checklistAccessLabel(kind, t)}</Badge>;
}
