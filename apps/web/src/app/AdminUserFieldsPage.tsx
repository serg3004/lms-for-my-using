import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminCard, AdminPageHeader, AdminPageLayout, ConfirmDialog, type AdminNavItem } from '../shared/adminPage.js';
import { ApiClientError } from '../shared/apiClient.js';
import {
  applyUserFieldTemplate, archiveUserField, createUserField, deleteUserField, listUserFields, reorderUserFields, restoreUserField, updateUserField,
  type UserFieldDefinition, type UserFieldInput,
} from '../shared/api/userFields.js';
import { DataTable, PageState, StatusBadge, type Column } from '../shared/ui.js';
import { editorFrom, emptyEditor, type EditorState } from '../features/user-fields/editorModel.js';
import { fieldLabel, languageOf } from '../features/user-fields/model.js';
import { UserFieldDialog } from '../features/user-fields/UserFieldDialog.js';

type Pending = { kind: 'archive' | 'delete'; field: UserFieldDefinition } | null;

/** PR 500: the administrator's page of custom user fields: list, editor, order, archive, delete and the ready-made set. */
export function AdminUserFieldsPage() {
  const { t, i18n } = useTranslation();
  const language = languageOf(i18n.language);
  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
    { label: t('admin.users.title', 'Users'), href: '/admin/users' },
    { label: t('userFields.title'), href: '/admin/user-fields', isCurrent: true },
  ];
  const [fields, setFields] = useState<UserFieldDefinition[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setFields((await listUserFields(showArchived)).items);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [showArchived]);
  useEffect(() => { void load(); }, [load]);

  const takenKeys = useMemo(() => new Set((fields ?? []).map((field) => field.key)), [fields]);
  const active = (fields ?? []).filter((field) => !field.archived);
  const failure = (error: unknown) => error instanceof ApiClientError && error.message ? error.message : t('userFields.actionFailed');

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setNotice({ kind: 'ok', text: success });
    } catch (error) {
      setNotice({ kind: 'error', text: failure(error) });
    }
    await load();
  }

  async function restoreTemplate() {
    try {
      const result = await applyUserFieldTemplate();
      setNotice({ kind: 'ok', text: result.created.length > 0 ? t('userFields.templateAdded', { count: result.created.length }) : t('userFields.templateNothing') });
    } catch (error) {
      setNotice({ kind: 'error', text: failure(error) });
    }
    await load();
  }

  async function save(input: UserFieldInput, mode: 'create' | 'edit') {
    setSaving(true);
    setDialogError(null);
    try {
      if (mode === 'create') await createUserField(input);
      else { const { key, type, ...rest } = input; await updateUserField(key!, rest); void type; }
      setEditor(null);
      setNotice({ kind: 'ok', text: t('userFields.saved') });
      await load();
    } catch (error) {
      setDialogError(error instanceof ApiClientError && error.status === 409 ? t('userFields.conflict') : failure(error));
    } finally {
      setSaving(false);
    }
  }

  async function move(field: UserFieldDefinition, delta: -1 | 1) {
    const keys = active.map((item) => item.key);
    const at = keys.indexOf(field.key);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= keys.length) return;
    [keys[at], keys[to]] = [keys[to]!, keys[at]!];
    await run(() => reorderUserFields(keys), t('userFields.reordered'));
  }

  async function confirm() {
    const current = pending;
    setPending(null);
    if (!current) return;
    if (current.kind === 'archive') await run(() => archiveUserField(current.field.key), t('userFields.archivedDone'));
    else await run(() => deleteUserField(current.field.key), t('userFields.deletedDone'));
  }

  const columns: Column<UserFieldDefinition>[] = [
    { key: 'title', label: t('userFields.colTitle'), priority: 'primary', render: (field) => <><strong>{fieldLabel(field, language)}</strong>{field.archived ? <> <StatusBadge tone="neutral">{t('userFields.archivedBadge')}</StatusBadge></> : null}<br /><code>{field.key}</code></> },
    { key: 'type', label: t('userFields.colType'), priority: 'secondary', render: (field) => t(`userFields.types.${field.type}`) },
    { key: 'rules', label: t('userFields.colRules'), priority: 'secondary', render: (field) => [field.required && t('userFields.required'), field.unique && t('userFields.uniqueShort'), field.searchable && t('userFields.searchableShort')].filter(Boolean).join(', ') || '—' },
    { key: 'access', label: t('userFields.colAccess'), priority: 'secondary', render: (field) => (['manager', 'self'] as const).map((viewer) => field.visibleTo.includes(viewer) ? `${t(`userFields.who.${viewer}`)}: ${field.editableBy.includes(viewer) ? t('userFields.accessEdit') : t('userFields.accessSee')}` : null).filter(Boolean).join('; ') || t('userFields.adminOnly') },
    { key: 'count', label: t('userFields.colCount'), priority: 'tertiary', align: 'end', render: (field) => field.valueCount ?? 0 },
    { key: 'actions', label: t('admin.users.col.actions', 'Actions'), priority: 'primary', render: (field) => {
      const at = active.findIndex((item) => item.key === field.key);
      const name = fieldLabel(field, language);
      return <div className="td-actions">
        <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => { setDialogError(null); setEditor(editorFrom(field)); }}>{t('admin.users.edit', 'Edit')}</button>
        {!field.archived ? <>
          <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" disabled={at <= 0} aria-label={`${t('userFields.moveUp')}: ${name}`} onClick={() => void move(field, -1)}>↑</button>
          <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" disabled={at < 0 || at >= active.length - 1} aria-label={`${t('userFields.moveDown')}: ${name}`} onClick={() => void move(field, 1)}>↓</button>
          <button className="admin-btn admin-btn--sm admin-btn--danger" type="button" onClick={() => setPending({ kind: 'archive', field })}>{t('userFields.archive')}</button>
        </> : <>
          <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void run(() => restoreUserField(field.key), t('userFields.restoredDone'))}>{t('userFields.restore')}</button>
          <button className="admin-btn admin-btn--sm admin-btn--danger" type="button" onClick={() => setPending({ kind: 'delete', field })}>{t('userFields.delete')}</button>
        </>}
      </div>;
    } },
  ];

  const header = <AdminPageHeader eyebrow={t('admin.users.eyebrow', 'Access management')} title={t('userFields.title')} subtitle={t('userFields.subtitle')}
    action={<div className="td-actions">
      <button className="admin-btn admin-btn--secondary" type="button" onClick={() => void restoreTemplate()}>{t('userFields.template')}</button>
      <button className="admin-btn admin-btn--primary" type="button" onClick={() => { setDialogError(null); setEditor(emptyEditor()); }}>{t('userFields.add')}</button>
    </div>} />;

  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
    {header}
    {fields === null && !loadFailed ? <PageState message={t('userFields.loading')} variant="loading" /> : null}
    {loadFailed ? <PageState title={t('userFields.title')} message={t('userFields.loadError')} variant="error" /> : null}
    {fields !== null ? <AdminCard>
      <p>{t('userFields.intro')}</p>
      <label><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> {t('userFields.showArchived')}</label>
      {notice && notice.text ? <p className={notice.kind === 'error' ? 'admin-form__error' : undefined} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p> : null}
      <DataTable label={t('userFields.title')} columns={columns} density="dense" rows={fields} keyExtractor={(field) => field.key} emptyMessage={t('userFields.empty')}
        responsiveDetails={{ label: t('courses.details'), expandLabel: (field) => `${t('courses.details')}: ${fieldLabel(field, language)}`, collapseLabel: (field) => `${t('courses.details')}: ${fieldLabel(field, language)}` }} />
    </AdminCard> : null}
    <UserFieldDialog initial={editor} takenKeys={takenKeys} saving={saving} error={dialogError} onSave={(input, mode) => void save(input, mode)} onClose={() => setEditor(null)} />
    <ConfirmDialog open={pending !== null} variant="danger" title={pending?.kind === 'delete' ? t('userFields.deleteTitle') : t('userFields.archiveTitle')}
      message={pending ? t(pending.kind === 'delete' ? 'userFields.deleteWarning' : 'userFields.archiveWarning', { name: fieldLabel(pending.field, language), count: pending.field.valueCount ?? 0 }) : ''}
      confirmLabel={pending?.kind === 'delete' ? t('userFields.delete') : t('userFields.archive')} cancelLabel={t('admin.users.cancel', 'Cancel')} onCancel={() => setPending(null)} onConfirm={() => void confirm()} />
  </AdminPageLayout>;
}
