import type { UserRole } from '@lms/shared/constants/roles';

import type { CustomFieldValues } from '../../shared/api/userFields.js';
import { toFormValues } from '../user-fields/model.js';

export type { UserRole } from '@lms/shared/constants/roles';
export type UserStatus = 'active' | 'invited' | 'suspended' | 'archived';

export type AdminUserSummary = {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  position: string | null;
  shift: string | null;
  phone: string | null;
  status: UserStatus;
  locale: string;
  timezone: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberships: Array<{ role: UserRole }>;
  /** PR 500: custom field values the caller may see. */
  customFields?: CustomFieldValues;
};

/** PR 501: a person without a mailbox carries a placeholder address on the `.invalid` domain, which nothing can deliver to. */
export const isNoEmail = (email: string) => email.trim().toLowerCase().endsWith('@no-email.invalid');

export type UserForm = {
  id?: string;
  departmentId?: string;
  email: string;
  password: string;
  /** PR 489: create with a server-made temporary password instead of an invitation or a chosen password. */
  temporaryPassword?: boolean;
  /** PR 501: create a person without email; `noEmailAccess` says how they get in. */
  noEmail?: boolean;
  noEmailAccess?: 'identity' | 'temporary';
  firstName: string;
  lastName: string;
  middleName: string;
  position: string;
  shift: string;
  phone: string;
  status: UserStatus;
  locale: string;
  timezone: string;
  role: UserRole | '';
  /** PR 500: custom field values as input text, and as they were loaded (only changes are sent). */
  customFields?: Record<string, string>;
  customFieldsOriginal?: Record<string, string>;
};

export type UserFormField = 'firstName' | 'lastName' | 'email' | 'password';
/** PR 501: the key of the standard employee number field. */
export const EMPLOYEE_NUMBER_KEY = 'employee_number';
export type UserFormMode = 'create' | 'edit';

export type AdminUsersFilters = { query: string; role: UserRole | ''; status: UserStatus | ''; /** PR 500: show only people whose custom field `fieldKey` equals `fieldValue`. */ fieldKey?: string; fieldValue?: string };

export const EMPTY_USER_FORM: UserForm = {
  email: '', password: '', firstName: '', lastName: '', middleName: '', position: '', shift: '', phone: '',
  status: 'active', locale: 'ru', timezone: 'Asia/Almaty', role: '',
};

export const EMPTY_USER_FILTERS: AdminUsersFilters = { query: '', role: '', status: '' };
export const USER_ROLES = ['learner', 'instructor', 'mentor', 'manager', 'admin'] as const satisfies readonly UserRole[];
export const USER_STATUSES: UserStatus[] = ['active', 'invited', 'suspended', 'archived'];

export function userName(user: AdminUserSummary) {
  return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ') || user.email;
}

export function userRole(user: AdminUserSummary): UserRole | '' {
  return user.memberships[0]?.role ?? '';
}

export function toEditUserForm(user: AdminUserSummary): UserForm {
  return {
    id: user.id, email: user.email, password: '', firstName: user.firstName, lastName: user.lastName,
    middleName: user.middleName ?? '', position: user.position ?? '', shift: user.shift ?? '', phone: user.phone ?? '',
    status: user.status, locale: user.locale, timezone: user.timezone, role: userRole(user),
    customFields: toFormValues(user.customFields), customFieldsOriginal: toFormValues(user.customFields),
  };
}

export function withoutPassword(form: UserForm): UserForm {
  return { ...form, password: '' };
}

/** PR 495: what archiving a user leaves behind, read before the administrator confirms. */
export type UserStatusImpact = {
  observerSessions: number;
  soleInstructorCourses: { id: string; title: string }[];
  openAssignments: number;
  subordinates: number;
  managedDepartments: number;
};
