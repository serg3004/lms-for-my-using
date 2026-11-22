import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listDepartments, type Department } from '../../shared/api/departments.js';
import { ConfirmDialog } from '../../shared/adminPage.js';
import { Dialog } from '../../shared/ui.js';
import type { BulkImpact, BulkReport } from './bulkActions.js';

/** PR 497: what archiving the chosen people affects, summed; archiving is possible only after this is shown. */
export function BulkArchiveDialog({ pending, onConfirm, onCancel, error }: { pending: { count: number; impact: BulkImpact | null } | null; onConfirm: () => void; onCancel: () => void; error: boolean }) {
  const { t } = useTranslation();
  const impact = pending?.impact ?? null;
  const lines: string[] = [];
  if (pending && !impact) lines.push(t('security.impactUnknown'));
  if (impact) {
    if (impact.observerSessions > 0) lines.push(t('security.impactSessions', { count: impact.observerSessions }));
    if (impact.soleInstructorCourses > 0) lines.push(t('security.bulkImpactCourses', { count: impact.soleInstructorCourses }));
    if (impact.openAssignments > 0) lines.push(t('security.impactAssignments', { count: impact.openAssignments }));
    if (impact.subordinates > 0) lines.push(t('security.impactSubordinates', { count: impact.subordinates }));
    if (impact.managedDepartments > 0) lines.push(t('security.impactDepartments', { count: impact.managedDepartments }));
    if (lines.length === 0) lines.push(t('security.impactNone'));
  }
  const message = [pending ? t('security.bulkArchiveIntro', { count: pending.count }) : '', ...lines, error ? t('security.bulkError') : ''].filter(Boolean).join(' ');
  return <ConfirmDialog
    cancelLabel={t('admin.users.cancel', 'Cancel')}
    confirmLabel={t('security.archiveConfirm')}
    message={message}
    onCancel={onCancel}
    onConfirm={impact ? onConfirm : onCancel}
    open={pending !== null}
    title={t('security.bulkArchiveTitle', { count: pending?.count ?? 0 })}
    variant="danger"
  />;
}

/** PR 497: the department the chosen people are moved into (only active ones are offered). */
export function BulkMoveDialog({ open, count, busy, error, onConfirm, onCancel }: { open: boolean; count: number; busy: boolean; error: boolean; onConfirm: (departmentId: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [departmentId, setDepartmentId] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setDepartmentId(''); setFailed(false);
    listDepartments({ status: 'active', pageSize: 200 }).then((page) => { if (active) setDepartments(page.items); }).catch(() => { if (active) { setDepartments([]); setFailed(true); } });
    return () => { active = false; };
  }, [open]);

  return <Dialog initialFocusRef={selectRef} labelledBy={titleId} onClose={onCancel} open={open}>
    <h2 id={titleId}>{t('security.bulkMoveTitle')}</h2>
    <p>{t('security.bulkMoveIntro', { count })}</p>
    <label className="admin-users-filter"><span>{t('security.bulkMoveChoose')}</span>
      <select onChange={(event) => setDepartmentId(event.target.value)} ref={selectRef} value={departmentId}>
        <option value="" />
        {(departments ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
    </label>
    {failed ? <p role="alert">{t('security.bulkMoveLoadError')}</p> : null}
    {error ? <p role="alert">{t('security.bulkError')}</p> : null}
    <div className="ds-dialog__actions">
      <button className="ds-button ds-button--secondary ds-button--md" disabled={busy} onClick={onCancel} type="button">{t('admin.users.cancel', 'Cancel')}</button>
      <button className="ds-button ds-button--primary ds-button--md" disabled={busy || !departmentId} onClick={() => onConfirm(departmentId)} type="button">{busy ? t('security.bulkRunning') : t('security.bulkMoveConfirm')}</button>
    </div>
  </Dialog>;
}

const REASON_KEYS: Record<string, string> = {
  self: 'bulkReasonSelf', lastAdmin: 'bulkReasonLastAdmin', archived: 'bulkReasonArchived', adminOnly: 'bulkReasonAdminOnly', invited: 'bulkReasonInvited',
  notFound: 'bulkReasonNotFound', forbidden: 'bulkReasonForbidden', conflict: 'bulkReasonConflict', rateLimited: 'bulkReasonRateLimited', failed: 'bulkReasonFailed',
};

/** PR 497: the report of a batch: the totals and, for everyone it did not touch, the reason. */
export function BulkResultDialog({ report, names, onClose }: { report: BulkReport | null; names: ReadonlyMap<string, string>; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const failures = report?.items.filter((item) => item.status !== 'done' && item.status !== 'unchanged') ?? [];
  return <Dialog initialFocusRef={closeRef} labelledBy={titleId} onClose={onClose} open={report !== null}>
    <h2 id={titleId}>{t('security.bulkResultTitle')}</h2>
    {report ? <p role="status">{t('security.bulkResultSummary', report.summary)}</p> : null}
    {failures.length > 0 ? <>
      <p>{t('security.bulkResultFailures')}</p>
      <ul>{failures.map((item) => <li key={item.userId}>{names.get(item.userId) ?? item.userId.slice(0, 8)}: {t(`security.${REASON_KEYS[item.reason ?? item.status] ?? 'bulkReasonFailed'}`)}</li>)}</ul>
    </> : null}
    <div className="ds-dialog__actions">
      <button className="ds-button ds-button--primary ds-button--md" onClick={onClose} ref={closeRef} type="button">{t('security.bulkClose')}</button>
    </div>
  </Dialog>;
}
