import type { TFunction } from 'i18next';

import type { FormValidationErrors } from '../../shared/formValidation.js';
import type { UserForm, UserFormField, UserFormMode } from './model.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUserForm(form: UserForm, _mode: UserFormMode, t: TFunction): FormValidationErrors<UserFormField> {
  const errors: FormValidationErrors<UserFormField> = {};
  if (!form.lastName.trim()) errors.lastName = t('admin.users.lastNameRequired', 'Last name is required');
  if (!form.firstName.trim()) errors.firstName = t('admin.users.firstNameRequired', 'First name is required');
  if (form.noEmail) return errors;
  if (!form.email.trim()) errors.email = t('admin.users.emailRequired', 'Email is required');
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = t('admin.users.emailInvalid', 'Enter a valid email address');
  return errors;
}
