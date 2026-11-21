import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '../../shared/adminPage.js';
import type { AdminUserSummary } from './model.js';

export type PasswordResetResult = { user: AdminUserSummary; delivered: boolean; resetUrl?: string } | { user: AdminUserSummary; error: string };

export type InvitationResult = { user: AdminUserSummary; delivered: boolean; inviteUrl?: string };

/** Tells the administrator where a new user's invitation went (their email) or hands over the link when mail is not set up. */
export function InvitationResultDialog({ result, onClose }: { result: InvitationResult | null; onClose: () => void }) {
  const { t } = useTranslation();
  const name = result ? `${result.user.lastName} ${result.user.firstName}`.trim() : '';
  const message = !result ? '' : result.delivered
    ? t('admin.users.invitationSent', 'An invitation was sent to {{email}}. The link works for 7 days.', { email: result.user.email })
    : t('admin.users.invitationLink', 'Mail is not set up, so give {{name}} this one-time link (works for 7 days, shown once): {{url}}', { name, url: result.inviteUrl ?? '' });
  return <ConfirmDialog cancelLabel={t('admin.users.close', 'Close')} confirmLabel={t('admin.users.close', 'Close')} message={message} onCancel={onClose} onConfirm={onClose} open={result !== null} title={t('admin.users.invitationTitle', 'Invitation')} />;
}

/** Confirms a password reset, then shows where the one-time link went (the user's email) or the link itself to hand over. */
export function ResetPasswordDialogs({ pending, result, onConfirm, onCancel, onClose }: {
  pending: AdminUserSummary | null; result: PasswordResetResult | null; onConfirm: () => void; onCancel: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const name = (user: AdminUserSummary) => `${user.lastName} ${user.firstName}`.trim();
  let message = '';
  if (result) {
    if ('error' in result) message = result.error;
    else if (result.delivered) message = t('admin.users.resetPasswordSent', 'A link to set a new password was sent to {{email}}. It works for one hour.', { email: result.user.email });
    else message = t('admin.users.resetPasswordLink', 'Mail is not set up, so give {{name}} this one-time link (works for one hour, shown once): {{url}}', { name: name(result.user), url: result.resetUrl ?? '' });
  }
  return <>
    <ConfirmDialog
      cancelLabel={t('admin.users.cancel', 'Cancel')}
      confirmLabel={t('admin.users.resetPassword', 'Reset password')}
      message={t('admin.users.resetPasswordConfirm', 'Reset the password of {{name}}? A one-time link to set a new one will be issued.', { name: pending ? name(pending) : '' })}
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={pending !== null}
      title={t('admin.users.resetPasswordTitle', 'Reset password')}
    />
    <ConfirmDialog
      cancelLabel={t('admin.users.close', 'Close')}
      confirmLabel={t('admin.users.close', 'Close')}
      message={message}
      onCancel={onClose}
      onConfirm={onClose}
      open={result !== null}
      title={t('admin.users.resetPasswordTitle', 'Reset password')}
    />
  </>;
}
