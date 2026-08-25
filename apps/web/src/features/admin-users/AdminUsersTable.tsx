import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { formatDate } from '../../shared/formatDate.js';

import { DataTable, StatusBadge, type Column } from '../../shared/ui.js';
import { userName, type AdminUserSummary, type UserStatus } from './model.js';

function statusTone(status: UserStatus) {
  if (status === 'active') return 'success';
  if (status === 'invited') return 'neutral';
  return 'danger';
}

function roleLabel(t: TFunction, role: string) {
  return t(`admin.roles.options.${role}`, role);
}

export function AdminUsersTable({ users, onEdit, onToggleStatus }: { users: AdminUserSummary[]; onEdit: (u: AdminUserSummary) => void; onToggleStatus: (u: AdminUserSummary) => void }) {
  const { t } = useTranslation();
  const columns: Column<AdminUserSummary>[] = [
    { key: 'name', label: t('admin.users.col.name', 'Name'), priority: 'primary', render: userName },
    { key: 'email', label: t('admin.users.col.email', 'Email'), priority: 'secondary', render: (u) => u.email },
    { key: 'role', label: t('admin.users.col.role', 'Role'), priority: 'secondary', render: (u) => u.memberships.map((m) => roleLabel(t, m.role)).join(', ') || '—' },
    { key: 'status', label: t('admin.users.col.status', 'Status'), priority: 'primary', render: (u) => <StatusBadge tone={statusTone(u.status)}>{t(`admin.users.status.${u.status}`, u.status)}</StatusBadge> },
    { key: 'lastLogin', label: t('admin.users.col.lastLogin', 'Last login'), priority: 'tertiary', render: (u) => u.lastLoginAt ? formatDate(u.lastLoginAt, undefined, { dateStyle: 'medium', timeStyle: 'short' }) : t('admin.users.never', 'Never') },
    { key: 'actions', label: t('admin.users.col.actions', 'Actions'), priority: 'primary', render: (u) => <div className="td-actions"><button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => onEdit(u)} type="button">{t('admin.users.edit', 'Edit')}</button><button className={`admin-btn admin-btn--sm ${u.status === 'active' ? 'admin-btn--danger' : 'admin-btn--secondary'}`} onClick={() => onToggleStatus(u)} type="button">{u.status === 'active' ? t('admin.users.deactivate', 'Deactivate') : t('admin.users.activate', 'Activate')}</button></div> },
  ];
  return <DataTable label={t('admin.users.title', 'Users')} columns={columns} density="dense" rows={users} keyExtractor={(u) => u.id} emptyMessage={t('admin.users.empty', 'No users match the current filters.')} responsiveDetails={{ label: t('courses.details'), expandLabel: (u) => `${t('courses.details')}: ${userName(u)}`, collapseLabel: (u) => `${t('courses.details')}: ${userName(u)}` }} />;
}
