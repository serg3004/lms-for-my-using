import { ActivationQrSheet } from './ActivationQrSheet.js';
import { BadgeSheet } from './BadgeSheet.js';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { listDepartments } from '../../shared/api/departments.js';
import type { UserFieldView } from '../../shared/api/userFields.js';
import type { FormValidationErrors } from '../../shared/formValidation.js';
import { AdminUserForm } from './AdminUserForm.js';
import type { UserForm, UserFormField, UserFormMode } from './model.js';

type Props = {
  activationQrUserId?: string | undefined;
  /** PR 506: an active person who may carry a badge (ordinary roles); the sheet issues, revokes and resets the PIN. */
  badgeUserId?: string | undefined;
  fields?: UserFieldView[];
  open: boolean; mode: UserFormMode; form: UserForm; errors: FormValidationErrors<UserFormField>;
  message: string | null; isSaving: boolean; onChange: (form: UserForm) => void;
  onErrorsChange: (errors: FormValidationErrors<UserFormField>) => void; onSubmit: (event: FormEvent) => void; onClose: () => void;
};

export function AdminUserDialog(props: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (props.open && dialog && !dialog.open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!props.open && dialog?.open) dialog.close();
  }, [props.open]);

  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [departmentsError, setDepartmentsError] = useState<string | null>(null);
  useEffect(() => {
    if (!props.open || props.mode !== 'create') return;
    let active = true;
    setDepartments([]);
    setDepartmentsLoading(true);
    setDepartmentsError(null);
    void (async () => {
      const items: Array<{ id: string; name: string }> = [];
      for (let page = 1; ; page++) {
        const result = await listDepartments({ page, pageSize: 200, status: 'active' });
        if (!active) return;
        items.push(...result.items);
        if (items.length >= result.total || result.items.length === 0) break;
      }
      if (active) setDepartments(items);
    })().catch(() => {
      if (active) setDepartmentsError(t('admin.users.departmentsLoadError', 'Unable to load departments. Close and reopen the dialog to retry.'));
    }).finally(() => { if (active) setDepartmentsLoading(false); });
    return () => { active = false; };
  }, [props.open, props.mode, t]);

  function close() {
    props.onClose();
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  return <dialog aria-labelledby={titleId} className="admin-dialog admin-user-dialog" ref={dialogRef} onCancel={(e) => { e.preventDefault(); close(); }} onClose={() => { if (props.open) close(); }}>
    <div className="admin-dialog__header"><h2 id={titleId}>{props.mode === 'create' ? t('admin.users.createDialogTitle', 'Create user') : t('admin.users.editDialogTitle', 'Edit user')}</h2><button aria-label={t('admin.users.closeDialog', 'Close user dialog')} className="admin-dialog__close" onClick={close} type="button">✕</button></div>
    {props.open && props.activationQrUserId ? <ActivationQrSheet key={props.activationQrUserId} userIds={[props.activationQrUserId]} canRevoke /> : null}
    {props.open && props.badgeUserId ? <BadgeSheet key={props.badgeUserId} userIds={[props.badgeUserId]} single /> : null}
    <AdminUserForm fields={props.fields ?? []} departments={departments} departmentsLoading={departmentsLoading} departmentsError={departmentsError} form={props.form} mode={props.mode} errors={props.errors} message={props.message} isSaving={props.isSaving} onChange={props.onChange} onErrorsChange={props.onErrorsChange} onSubmit={props.onSubmit} onCancel={close} />
  </dialog>;
}
