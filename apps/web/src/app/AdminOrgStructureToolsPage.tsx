import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { commitOrgStructureImport, listOrgStructureHistory, previewOrgStructureImport, type ImportKind, type ImportMode, type ImportPreview } from '../shared/api/org-structure-admin.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { Badge, Button, PageState } from '../shared/ui.js';

export function AdminOrgStructureToolsPage() {
  const { t } = useTranslation(); const { currentUser } = useSession();
  const [kind, setKind] = useState<ImportKind>('DEPARTMENTS'); const [mode, setMode] = useState<ImportMode>('CREATE_ONLY');
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const { state, reload } = useAsyncData(() => listOrgStructureHistory(), [t], { unauthenticated: 'Your session expired.', error: 'Unable to load organization history.' });
  async function submit(event: FormEvent) { event.preventDefault(); if (!file) return; setBusy(true); setMessage(''); try { setPreview(await previewOrgStructureImport(file, kind, mode)); } catch { setMessage('Unable to validate the CSV file.'); } finally { setBusy(false); } }
  async function commit() { if (!preview?.token) return; setBusy(true); try { const result = await commitOrgStructureImport(preview.token); setMessage(`Imported ${result.imported} rows.`); setPreview(null); await reload(); } catch { setMessage('Import could not be committed. Preview again and resolve any conflicts.'); } finally { setBusy(false); } }
  const nav: AdminNavItem[] = [{ label: 'Departments', href: '/admin/departments' }, { label: 'Import & history', href: '/admin/org-structure-tools', isCurrent: true }];
  return <AdminPageLayout brandLabel="LearnSpace" sidebarLabel="Admin navigation" navItems={nav} currentUser={currentUser ?? undefined}>
    <AdminPageHeader eyebrow="Organization structure" title="Import & history" subtitle="Validate CSV changes before applying them, and review the durable change history." />
    <section className="admin-card"><h2>CSV import</h2><form className="admin-form" onSubmit={submit}>
      <FormField id="org-import-kind" label="Import data"><select id="org-import-kind" value={kind} onChange={e => { setKind(e.target.value as ImportKind); setPreview(null); }}><option value="DEPARTMENTS">Departments</option><option value="MEMBERSHIPS">Memberships</option></select></FormField>
      <FormField id="org-import-mode" label="Mode"><select id="org-import-mode" value={mode} onChange={e => { setMode(e.target.value as ImportMode); setPreview(null); }}><option value="CREATE_ONLY">Create only</option><option value="UPSERT">Create or update</option></select></FormField>
      <FormField id="org-import-file" label="UTF-8 CSV file" hint="Maximum 5 MiB and 10,000 data rows."><input id="org-import-file" type="file" accept=".csv,text/csv" required onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} /></FormField>
      <Button type="submit" disabled={busy || !file}>Preview import</Button>
    </form>
    {preview ? <div aria-live="polite"><p><Badge variant={preview.valid ? 'done' : 'overdue'}>{preview.valid ? `${preview.rowCount} rows valid` : `${preview.errors.length} validation errors`}</Badge></p>
      {preview.errors.length ? <ul>{preview.errors.map((error, index) => <li key={index}>Row {error.row}, {error.field}: {error.message}</li>)}</ul> : null}
      {preview.token ? <Button onClick={commit} disabled={busy}>Commit validated import</Button> : null}</div> : null}{message ? <p role="status">{message}</p> : null}</section>
    <section className="admin-card"><h2>Change history</h2>{state.status === 'loading' ? <PageState variant="loading" message="Loading history…" /> : state.status !== 'loaded' ? <PageState variant="error" message={state.message} /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Change</th><th>Entity</th><th>Actor</th></tr></thead><tbody>{state.data.items.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.eventType}</td><td>{item.entityType}</td><td>{item.actorId ?? 'System'}</td></tr>)}</tbody></table></div>}</section>
  </AdminPageLayout>;
}
