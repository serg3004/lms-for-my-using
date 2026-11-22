import { useTranslation } from 'react-i18next';

import { BadgeSheet } from './BadgeSheet.js';
import type { BulkActionName } from './bulkActions.js';

export type BulkScope = { mode: 'rows'; count: number } | { mode: 'filter'; count: number };

/**
 * PR 497: the actions over the chosen users. A manager gets block, unblock, move and invitation; archiving is the administrator's.
 * Offers "everyone matching the filter" when the chosen page is only a part of it.
 */
export function BulkUserBar({ badgeUserIds, scope, canArchive, canSelectAll, matching, onAction, onSelectAll, onClear, busy }: {
  /** PR 506: the chosen rows, for the badge sheet; empty when the choice is "everyone matching the filter". */
  badgeUserIds?: string[];
  scope: BulkScope;
  canArchive: boolean;
  canSelectAll: boolean;
  matching: number | null;
  onAction: (action: BulkActionName) => void;
  onSelectAll: () => void;
  onClear: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const actions: Array<[BulkActionName, string]> = [
    ['suspend', t('security.bulkSuspend')], ['activate', t('security.bulkActivate')], ['move', t('security.bulkMove')], ['resend', t('security.bulkResend')],
    ...(canArchive ? [['archive', t('security.bulkArchive')] as [BulkActionName, string]] : []),
  ];
  return <div className="td-actions">
    {actions.map(([action, label]) => <button className={`admin-btn admin-btn--sm ${action === 'archive' ? 'admin-btn--danger' : 'admin-btn--secondary'}`} disabled={busy} key={action} onClick={() => onAction(action)} type="button">{label}</button>)}
    {scope.mode === 'filter'
      ? <span>{t('security.bulkAllMatchingSelected', { count: scope.count })}</span>
      : canSelectAll && matching !== null && matching > scope.count
        ? <button className="admin-btn admin-btn--sm admin-btn--secondary" disabled={busy} onClick={onSelectAll} type="button">{t('security.bulkSelectAllMatching', { count: matching })}</button>
        : null}
    {badgeUserIds && badgeUserIds.length > 0 && scope.mode === 'rows' ? <BadgeSheet key={badgeUserIds.join(',')} userIds={badgeUserIds} /> : null}
    <button className="admin-btn admin-btn--sm admin-btn--secondary" disabled={busy} onClick={onClear} type="button">{t('security.bulkClear')}</button>
  </div>;
}
