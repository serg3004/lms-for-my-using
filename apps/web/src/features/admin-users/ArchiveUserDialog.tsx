import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '../../shared/adminPage.js';
import { userName, type AdminUserSummary, type UserStatusImpact } from './model.js';

export type PendingArchive = { user: AdminUserSummary; impact: UserStatusImpact | null };

/** PR 495: shows what archiving leaves behind and archives only after the administrator confirms. */
export function ArchiveUserDialog({ pending, error, onConfirm, onCancel }: { pending: PendingArchive | null; error: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const impact = pending?.impact ?? null;
  const lines: string[] = [];
  if (pending && !impact) lines.push(t('security.impactUnknown'));
  if (impact) {
    if (impact.observerSessions > 0) lines.push(t('security.impactSessions', { count: impact.observerSessions }));
    if (impact.soleInstructorCourses.length > 0) lines.push(t('security.impactCourses', { titles: impact.soleInstructorCourses.map((course) => course.title).join(', ') }));
    if (impact.openAssignments > 0) lines.push(t('security.impactAssignments', { count: impact.openAssignments }));
    if (impact.subordinates > 0) lines.push(t('security.impactSubordinates', { count: impact.subordinates }));
    if (impact.managedDepartments > 0) lines.push(t('security.impactDepartments', { count: impact.managedDepartments }));
    if (lines.length === 0) lines.push(t('security.impactNone'));
  }
  const message = [pending ? t('security.archiveIntro', { name: userName(pending.user) }) : '', ...lines, error ? t('security.archiveError') : ''].filter(Boolean).join(' ');

  return <ConfirmDialog
    cancelLabel={t('admin.users.cancel', 'Cancel')}
    confirmLabel={t('security.archiveConfirm')}
    message={message}
    onCancel={onCancel}
    onConfirm={impact ? onConfirm : onCancel}
    open={pending !== null}
    title={t('security.archiveTitle')}
    variant="danger"
  />;
}
