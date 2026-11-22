import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { FormField } from '../../shared/adminPage.js';
import { PasswordInput } from '../../shared/PasswordInput.js';
import type { UserFieldView } from '../../shared/api/userFields.js';
import { CustomFieldInputs } from '../user-fields/CustomFieldInputs.js';
import { clearFieldError, type FormValidationErrors } from '../../shared/formValidation.js';
import { USER_ROLES, USER_STATUSES, type UserForm, type UserFormField, type UserFormMode } from './model.js';

type Props = {
  /** PR 500: custom fields the caller may see; their inputs follow the standard ones. */
  fields?: UserFieldView[];
  departments?: Array<{ id: string; name: string }>;
  departmentsLoading?: boolean;
  departmentsError?: string | null;
  form: UserForm; mode: UserFormMode; errors: FormValidationErrors<UserFormField>; message: string | null;
  isSaving: boolean; onChange: (form: UserForm) => void; onErrorsChange: (errors: FormValidationErrors<UserFormField>) => void;
  onSubmit: (event: FormEvent) => void; onCancel: () => void;
};

export function AdminUserForm({ fields = [], departments = [], departmentsLoading = false, departmentsError, form, mode, errors, message, isSaving, onChange, onErrorsChange, onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  const field = (name: UserFormField, value: string) => {
    onChange({ ...form, [name]: value });
    onErrorsChange(clearFieldError(errors, name));
  };
  return <form className="admin-form" onSubmit={onSubmit}>
    <div className="admin-form__row">
      <FormField id="user-lastName" label={t('admin.users.fieldLastName', 'Last name')} required error={errors.lastName}><input autoFocus id="user-lastName" aria-describedby={errors.lastName ? 'user-lastName-error' : undefined} aria-invalid={Boolean(errors.lastName)} value={form.lastName} onChange={(e) => field('lastName', e.target.value)} /></FormField>
      <FormField id="user-firstName" label={t('admin.users.fieldFirstName', 'First name')} required error={errors.firstName}><input id="user-firstName" aria-describedby={errors.firstName ? 'user-firstName-error' : undefined} aria-invalid={Boolean(errors.firstName)} value={form.firstName} onChange={(e) => field('firstName', e.target.value)} /></FormField>
      <FormField id="user-middleName" label={t('admin.users.fieldMiddleName', 'Middle name')}><input id="user-middleName" value={form.middleName} onChange={(e) => onChange({ ...form, middleName: e.target.value })} /></FormField>
    </div>
    <FormField id="user-email" label={t('admin.users.fieldEmail', 'Email')} required error={errors.email}><input id="user-email" type="email" aria-describedby={errors.email ? 'user-email-error' : undefined} aria-invalid={Boolean(errors.email)} value={form.email} onChange={(e) => field('email', e.target.value)} /></FormField>
    {mode === 'create' && <FormField id="user-password" label={t('admin.users.fieldPasswordOptional', 'Password (optional)')} hint={t('admin.users.passwordInviteHint', 'Leave empty: the user will get an email invitation and set their own password.')} error={errors.password}><PasswordInput id="user-password" disabled={Boolean(form.temporaryPassword)} autoComplete="new-password" aria-describedby={errors.password ? 'user-password-error' : undefined} aria-invalid={Boolean(errors.password)} value={form.password} onChange={(e) => field('password', e.target.value)} /></FormField>}
    {mode === 'create' && <label><input checked={Boolean(form.temporaryPassword)} onChange={(e) => onChange({ ...form, password: e.target.checked ? '' : form.password, temporaryPassword: e.target.checked })} type="checkbox" /> {t('security.accessTemporary')}</label>}
    {mode === 'edit' && <><div className="admin-form__row">
      <FormField id="user-position" label={t('admin.users.fieldPosition', 'Position')}><input id="user-position" value={form.position} onChange={(e) => onChange({ ...form, position: e.target.value })} /></FormField>
      <FormField id="user-shift" label={t('admin.users.fieldShift', 'Shift')}><input id="user-shift" value={form.shift} onChange={(e) => onChange({ ...form, shift: e.target.value })} /></FormField>
      <FormField id="user-phone" label={t('admin.users.fieldPhone', 'Phone')}><input id="user-phone" value={form.phone} onChange={(e) => onChange({ ...form, phone: e.target.value })} /></FormField>
    </div><div className="admin-form__row">
      <FormField id="user-status" label={t('admin.users.fieldStatus', 'Status')}><select id="user-status" value={form.status} onChange={(e) => onChange({ ...form, status: e.target.value as UserForm['status'] })}>{USER_STATUSES.map((x) => <option key={x} value={x}>{t(`admin.users.status.${x}`, x)}</option>)}</select></FormField>
      <FormField id="user-locale" label={t('admin.users.fieldLocale', 'Locale')} required><input id="user-locale" required value={form.locale} onChange={(e) => onChange({ ...form, locale: e.target.value })} /></FormField>
      <FormField id="user-timezone" label={t('admin.users.fieldTimezone', 'Timezone')} required><input id="user-timezone" required value={form.timezone} onChange={(e) => onChange({ ...form, timezone: e.target.value })} /></FormField>
    </div></>}
    <FormField id="user-role" label={t('admin.users.fieldRole', 'Role')}><select id="user-role" value={form.role} onChange={(e) => onChange({ ...form, role: e.target.value as UserForm['role'] })}><option value="">{t('admin.users.noRoleOption', '— No role —')}</option>{USER_ROLES.map((x) => <option key={x} value={x}>{t(`admin.roles.options.${x}`, x)}</option>)}</select></FormField>
    {mode === 'create' && <FormField id="user-department" label={t('admin.users.fieldDepartment', 'Department')}>
      <select id="user-department" disabled={departmentsLoading || Boolean(departmentsError)} value={form.departmentId ?? ''} onChange={(e) => onChange({ ...form, departmentId: e.target.value })}>
        <option value="">{t('admin.users.noDepartmentOption', '— No department —')}</option>
        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
      {departmentsLoading && <p role="status">{t('admin.users.departmentsLoading', 'Loading departments…')}</p>}
      {departmentsError && <p role="alert">{departmentsError}</p>}
    </FormField>}
    {fields.length > 0 && <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
      <legend>{t('userFields.formSection')}</legend>
      <CustomFieldInputs fields={fields} values={form.customFields ?? {}} idPrefix="user-field" onChange={(key, value) => onChange({ ...form, customFields: { ...form.customFields, [key]: value } })} />
    </fieldset>}
    {message && <p className="admin-form__error" role="alert">{message}</p>}
    <div className="admin-form__actions"><button className="admin-btn admin-btn--secondary" onClick={onCancel} type="button">{t('admin.users.cancel', 'Cancel')}</button><button className="admin-btn admin-btn--primary" disabled={isSaving} type="submit">{isSaving ? t('admin.users.saving', 'Saving...') : t('admin.users.save', 'Save')}</button></div>
  </form>;
}
