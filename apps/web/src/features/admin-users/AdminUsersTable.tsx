import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { formatDate } from '../../shared/formatDate.js';

import type { ReactNode } from 'react';
import { DataTable, StatusBadge, type Column, type DataTableSelection } from '../../shared/ui.js';
import type { UserFieldView } from '../../shared/api/userFields.js';
import { displayValue, fieldLabel, languageOf } from '../user-fields/model.js';
import { userName, type AdminUserSummary, type UserStatus } from './model.js';

function statusTone(status: UserStatus) {
  if (status === 'active') return 'success';
  if (status === 'invited') return 'neutral';
  return 'danger';
}

function roleLabel(t: TFunction, role: string) {
  return t(`admin.roles.options.${role}`, role);
}

export function AdminUsersTable({ extraFields = [], selection, batchActions, users, onEdit, onToggleStatus, onResetPassword, onTemporaryPassword, onRights, onArchive, onRestore }: { /** PR 500: custom fields shown as extra columns. */ extraFields?: UserFieldView[]; selection?: DataTableSelection<AdminUserSummary>; batchActions?: ReactNode; users: AdminUserSummary[]; onArchive?: (u: AdminUserSummary) => void; onRestore?: (u: AdminUserSummary) => void; onEdit: (u: AdminUserSummary) => void; onToggleStatus: (u: AdminUserSummary) => void; onResetPassword: (u: AdminUserSummary) => void; onTemporaryPassword?: (u: AdminUserSummary) => void; onRights?: (u: AdminUserSummary) => void }) {
  const { t, i18n } = useTranslation();
  const language = languageOf(i18n.language);
  const fieldColumns: Column<AdminUserSummary>[] = extraFields.map((field) => ({ key: `field:${field.key}`, label: fieldLabel(field, language), priority: 'secondary' as const, render: (u: AdminUserSummary) => displayValue(field, u.customFields?.[field.key], language, t('userFields.yes'), t('userFields.no')) || '—' }));
  const columns: Column<AdminUserSummary>[] = [
    { key: 'name', label: t('admin.users.col.name', 'Name'), priority: 'primary', render: userName },
    { key: 'email', label: t('admin.users.col.email', 'Email'), priority: 'secondary', render: (u) => u.email },
    { key: 'role', label: t('admin.users.col.role', 'Role'), priority: 'secondary', render: (u) => u.memberships.map((m) => roleLabel(t, m.role)).join(', ') || '—' },
    { key: 'status', label: t('admin.users.col.status', 'Status'), priority: 'primary', render: (u) => <StatusBadge tone={statusTone(u.status)}>{t(`admin.users.status.${u.status}`, u.status)}</StatusBadge> },
    { key: 'lastLogin', label: t('admin.users.col.lastLogin', 'Last login'), priority: 'tertiary', render: (u) => u.lastLoginAt ? formatDate(u.lastLoginAt, undefined, { dateStyle: 'medium', timeStyle: 'short' }) : t('admin.users.never', 'Never') },
    ...fieldColumns,
    { key: 'actions', label: t('admin.users.col.actions', 'Actions'), priority: 'secondary', render: (u) => <div className="td-actions"><button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => onEdit(u)} type="button">{t('admin.users.edit', 'Edit')}</button>{onRights ? <button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => onRights(u)} type="button">{t('admin.users.rights', 'Rights')}</button> : null}{u.status === 'active' ? <button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => onResetPassword(u)} type="button">{t('admin.users.resetPassword', 'Reset password')}</button> : null}{u.status === 'active' && onTemporaryPassword ? <button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => onTemporaryPassword(u)} type="button">{t('security.tempAction')}</button> : null}<a className="admin-btn admin-btn--sm admin-btn--secondary" href={`/admin/users/${u.id}/logins`}>{t('security.journalLink')}</a><a className="admin-btn admin-btn--sm admin-btn--secondary" href={`/admin/results/courses/user/${u.id}`}>{t('courseAnalytics.userLink', 'Course report')}</a>{u.status === 'archived' ? (onRestore ? <button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => onRestore(u)} type="button">{t('security.restoreAction')}</button> : null) : <button className={`admin-btn admin-btn--sm ${u.status === 'active' ? 'admin-btn--danger' : 'admin-btn--secondary'}`} onClick={() => onToggleStatus(u)} type="button">{u.status === 'active' ? t('admin.users.deactivate', 'Deactivate') : t('admin.users.activate', 'Activate')}</button>}{u.status !== 'archived' && onArchive ? <button className="admin-btn admin-btn--sm admin-btn--danger" onClick={() => onArchive(u)} type="button">{t('security.archiveAction')}</button> : null}</div> },
  ];
  return <DataTable selection={selection} batchActions={batchActions} label={t('admin.users.title', 'Users')} columns={columns} density="dense" rows={users} keyExtractor={(u) => u.id} emptyMessage={t('admin.users.empty', 'No users match the current filters.')} responsiveDetails={{ label: t('courses.details'), expandLabel: (u) => `${t('courses.details')}: ${userName(u)}`, collapseLabel: (u) => `${t('courses.details')}: ${userName(u)}` }} />;
}
