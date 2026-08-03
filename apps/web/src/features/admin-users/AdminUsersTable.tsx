import { useTranslation } from 'react-i18next';

import { DataTable, StatusBadge, type Column } from '../../shared/ui.js';
import { userName, type AdminUserSummary } from './model.js';

export function AdminUsersTable({ users, onEdit, onToggleStatus }: { users: AdminUserSummary[]; onEdit: (u: AdminUserSummary) => void; onToggleStatus: (u: AdminUserSummary) => void }) {
  const { t } = useTranslation();
  const columns: Column<AdminUserSummary>[] = [
    { key: 'name', label: t('admin.users.col.name', 'Name'), render: userName },
    { key: 'email', label: t('admin.users.col.email', 'Email'), render: (u) => u.email },
    { key: 'role', label: t('admin.users.col.role', 'Role'), render: (u) => u.memberships.map((m) => m.role).join(', ') || '—' },
    { key: 'status', label: t('admin.users.col.status', 'Status'), render: (u) => <StatusBadge tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status}</StatusBadge> },
    { key: 'lastLogin', label: t('admin.users.col.lastLogin', 'Last login'), render: (u) => u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : t('admin.users.never', 'Never') },
    { key: 'actions', label: t('admin.users.col.actions', 'Actions'), render: (u) => <><button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => onEdit(u)} type="button">{t('admin.users.edit', 'Edit')}</button>{' '}<button className={`admin-btn admin-btn--sm ${u.status === 'active' ? 'admin-btn--danger' : 'admin-btn--secondary'}`} onClick={() => onToggleStatus(u)} type="button">{u.status === 'active' ? t('admin.users.deactivate', 'Deactivate') : t('admin.users.activate', 'Activate')}</button></> },
  ];
  return <DataTable columns={columns} rows={users} keyExtractor={(u) => u.id} emptyMessage={t('admin.users.empty', 'No users match the current filters.')} />;
}
