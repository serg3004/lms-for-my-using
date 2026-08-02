export type UserRole = 'learner' | 'instructor' | 'manager' | 'admin';
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
};

export type UserForm = {
  id?: string;
  email: string;
  password: string;
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
};

export type UserFormField = 'firstName' | 'lastName' | 'email' | 'password';
export type UserFormMode = 'create' | 'edit';

export type AdminUsersFilters = { query: string; role: UserRole | ''; status: UserStatus | '' };

export const EMPTY_USER_FORM: UserForm = {
  email: '', password: '', firstName: '', lastName: '', middleName: '', position: '', shift: '', phone: '',
  status: 'active', locale: 'ru', timezone: 'Asia/Almaty', role: '',
};

export const EMPTY_USER_FILTERS: AdminUsersFilters = { query: '', role: '', status: '' };
export const USER_ROLES: UserRole[] = ['learner', 'instructor', 'manager', 'admin'];
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
  };
}

export function withoutPassword(form: UserForm): UserForm {
  return { ...form, password: '' };
}
