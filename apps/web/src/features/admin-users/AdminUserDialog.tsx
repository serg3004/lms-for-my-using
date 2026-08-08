import { useEffect, useId, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { FormValidationErrors } from '../../shared/formValidation.js';
import { AdminUserForm } from './AdminUserForm.js';
import type { UserForm, UserFormField, UserFormMode } from './model.js';

type Props = {
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

  function close() {
    props.onClose();
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  return <dialog aria-labelledby={titleId} className="admin-dialog admin-user-dialog" ref={dialogRef} onCancel={(e) => { e.preventDefault(); close(); }} onClose={() => { if (props.open) close(); }}>
    <div className="admin-dialog__header"><h2 id={titleId}>{props.mode === 'create' ? t('admin.users.createDialogTitle', 'Create user') : t('admin.users.editDialogTitle', 'Edit user')}</h2><button aria-label={t('admin.users.closeDialog', 'Close user dialog')} className="admin-dialog__close" onClick={close} type="button">✕</button></div>
    <AdminUserForm form={props.form} mode={props.mode} errors={props.errors} message={props.message} isSaving={props.isSaving} onChange={props.onChange} onErrorsChange={props.onErrorsChange} onSubmit={props.onSubmit} onCancel={close} />
  </dialog>;
}
