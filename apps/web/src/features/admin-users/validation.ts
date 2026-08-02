import type { FormValidationErrors } from '../../shared/formValidation.js';
import type { UserForm, UserFormField, UserFormMode } from './model.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUserForm(form: UserForm, mode: UserFormMode): FormValidationErrors<UserFormField> {
  const errors: FormValidationErrors<UserFormField> = {};
  if (!form.lastName.trim()) errors.lastName = 'Last name is required';
  if (!form.firstName.trim()) errors.firstName = 'First name is required';
  if (!form.email.trim()) errors.email = 'Email is required';
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = 'Enter a valid email address';
  if (mode === 'create' && !form.password) errors.password = 'Password is required';
  else if (mode === 'create' && form.password.length < 8) errors.password = 'Password must be at least 8 characters';
  return errors;
}
