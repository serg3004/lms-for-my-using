import { DataTable, StatusBadge, type Column } from '../../shared/ui.js';
import { userName, type AdminUserSummary } from './model.js';

export function AdminUsersTable({ users, onEdit, onToggleStatus }: { users: AdminUserSummary[]; onEdit: (u: AdminUserSummary) => void; onToggleStatus: (u: AdminUserSummary) => void }) {
  const columns: Column<AdminUserSummary>[] = [
    { key: 'name', label: 'Name', render: userName },
    { key: 'email', label: 'Email', render: (u) => u.email },
    { key: 'role', label: 'Role', render: (u) => u.memberships.map((m) => m.role).join(', ') || '—' },
    { key: 'status', label: 'Status', render: (u) => <StatusBadge tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status}</StatusBadge> },
    { key: 'lastLogin', label: 'Last login', render: (u) => u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never' },
    { key: 'actions', label: 'Actions', render: (u) => <><button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => onEdit(u)} type="button">Edit</button>{' '}<button className={`admin-btn admin-btn--sm ${u.status === 'active' ? 'admin-btn--danger' : 'admin-btn--secondary'}`} onClick={() => onToggleStatus(u)} type="button">{u.status === 'active' ? 'Deactivate' : 'Activate'}</button></> },
  ];
  return <DataTable columns={columns} rows={users} keyExtractor={(u) => u.id} emptyMessage="No users match the current filters." />;
}
