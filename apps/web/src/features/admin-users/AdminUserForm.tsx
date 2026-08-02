import type { FormEvent } from 'react';

import { FormField } from '../../shared/adminPage.js';
import { clearFieldError, type FormValidationErrors } from '../../shared/formValidation.js';
import { USER_ROLES, USER_STATUSES, type UserForm, type UserFormField, type UserFormMode } from './model.js';

type Props = {
  form: UserForm; mode: UserFormMode; errors: FormValidationErrors<UserFormField>; message: string | null;
  isSaving: boolean; onChange: (form: UserForm) => void; onErrorsChange: (errors: FormValidationErrors<UserFormField>) => void;
  onSubmit: (event: FormEvent) => void; onCancel: () => void;
};

export function AdminUserForm({ form, mode, errors, message, isSaving, onChange, onErrorsChange, onSubmit, onCancel }: Props) {
  const field = (name: UserFormField, value: string) => {
    onChange({ ...form, [name]: value });
    onErrorsChange(clearFieldError(errors, name));
  };
  return <form className="admin-form" onSubmit={onSubmit}>
    <div className="admin-form__row">
      <FormField id="user-lastName" label="Last name" required error={errors.lastName}><input autoFocus id="user-lastName" aria-describedby={errors.lastName ? 'user-lastName-error' : undefined} aria-invalid={Boolean(errors.lastName)} value={form.lastName} onChange={(e) => field('lastName', e.target.value)} /></FormField>
      <FormField id="user-firstName" label="First name" required error={errors.firstName}><input id="user-firstName" aria-describedby={errors.firstName ? 'user-firstName-error' : undefined} aria-invalid={Boolean(errors.firstName)} value={form.firstName} onChange={(e) => field('firstName', e.target.value)} /></FormField>
      <FormField id="user-middleName" label="Middle name"><input id="user-middleName" value={form.middleName} onChange={(e) => onChange({ ...form, middleName: e.target.value })} /></FormField>
    </div>
    <FormField id="user-email" label="Email" required error={errors.email}><input id="user-email" type="email" aria-describedby={errors.email ? 'user-email-error' : undefined} aria-invalid={Boolean(errors.email)} value={form.email} onChange={(e) => field('email', e.target.value)} /></FormField>
    {mode === 'create' && <FormField id="user-password" label="Password" required error={errors.password}><input id="user-password" type="password" minLength={8} autoComplete="new-password" aria-describedby={errors.password ? 'user-password-error' : undefined} aria-invalid={Boolean(errors.password)} value={form.password} onChange={(e) => field('password', e.target.value)} /></FormField>}
    {mode === 'edit' && <><div className="admin-form__row">
      <FormField id="user-position" label="Position"><input id="user-position" value={form.position} onChange={(e) => onChange({ ...form, position: e.target.value })} /></FormField>
      <FormField id="user-shift" label="Shift"><input id="user-shift" value={form.shift} onChange={(e) => onChange({ ...form, shift: e.target.value })} /></FormField>
      <FormField id="user-phone" label="Phone"><input id="user-phone" value={form.phone} onChange={(e) => onChange({ ...form, phone: e.target.value })} /></FormField>
    </div><div className="admin-form__row">
      <FormField id="user-status" label="Status"><select id="user-status" value={form.status} onChange={(e) => onChange({ ...form, status: e.target.value as UserForm['status'] })}>{USER_STATUSES.map((x) => <option key={x}>{x}</option>)}</select></FormField>
      <FormField id="user-locale" label="Locale" required><input id="user-locale" required value={form.locale} onChange={(e) => onChange({ ...form, locale: e.target.value })} /></FormField>
      <FormField id="user-timezone" label="Timezone" required><input id="user-timezone" required value={form.timezone} onChange={(e) => onChange({ ...form, timezone: e.target.value })} /></FormField>
    </div></>}
    <FormField id="user-role" label="Role"><select id="user-role" value={form.role} onChange={(e) => onChange({ ...form, role: e.target.value as UserForm['role'] })}><option value="">— No role —</option>{USER_ROLES.map((x) => <option key={x}>{x}</option>)}</select></FormField>
    {message && <p className="admin-form__error" role="alert">{message}</p>}
    <div className="admin-form__actions"><button className="admin-btn admin-btn--secondary" onClick={onCancel} type="button">Cancel</button><button className="admin-btn admin-btn--primary" disabled={isSaving} type="submit">{isSaving ? 'Saving...' : 'Save'}</button></div>
  </form>;
}
