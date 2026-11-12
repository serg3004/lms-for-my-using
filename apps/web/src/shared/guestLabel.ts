import type { TFunction } from 'i18next';

import type { ChecklistInstanceSummary } from './api/types.js';

type Translate = TFunction;

/** PR 468: how a pass without an account reads everywhere results are shown: "Guest: name", or "Guest" when no name was given. */
export function guestLabel(t: Translate, guestName: string | null | undefined): string {
  const name = guestName?.trim();
  return name ? t('guest.labelNamed', 'Guest: {{name}}', { name }) : t('guest.label', 'Guest');
}

/** The person line of an instance: the guest label for a guest, otherwise the fallback built from the user id. */
export function instancePersonLabel(t: Translate, instance: Pick<ChecklistInstanceSummary, 'isGuest' | 'guestName'>, fallback: () => string): string {
  return instance.isGuest ? guestLabel(t, instance.guestName) : fallback();
}
