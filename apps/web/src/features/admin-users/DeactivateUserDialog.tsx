import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '../../shared/adminPage.js';
import type { AdminUserSummary } from './model.js';

export type PendingDeactivation = { user: AdminUserSummary; observerSessions: number | null };

/** PR 346: confirms deactivation and warns, before it happens, about unfinished observer sessions. */
export function DeactivateUserDialog({ pending, onConfirm, onCancel }: { pending: PendingDeactivation | null; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const name = pending ? `${pending.user.lastName} ${pending.user.firstName}`.trim() : '';
  const sessions = pending?.observerSessions ?? null;
  const warning = sessions === null
    ? t('admin.users.deactivateSessionsUnknown', 'Could not check the unfinished observation sessions of this user.')
    : sessions > 0
      ? t('admin.users.deactivateSessionsWarning', 'The user has unfinished observation sessions: {{sessions}}. After deactivation, assign another observer to them.', { sessions })
      : '';
  const message = [t('admin.users.deactivateConfirm', 'Deactivate {{name}}? The user will lose access to the system.', { name }), warning].filter(Boolean).join(' ');

  return <ConfirmDialog
    cancelLabel={t('admin.users.cancel', 'Cancel')}
    confirmLabel={t('admin.users.deactivate', 'Deactivate')}
    message={message}
    onCancel={onCancel}
    onConfirm={onConfirm}
    open={pending !== null}
    title={t('admin.users.deactivateTitle', 'Deactivate user')}
    variant="danger"
  />;
}
