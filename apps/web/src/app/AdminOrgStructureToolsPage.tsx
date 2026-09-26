import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import {
  commitOrgStructureImport,
  listOrgStructureHistory,
  previewOrgStructureImport,
  ORG_STRUCTURE_HISTORY_PAGE_SIZE,
  type ImportKind,
  type ImportMode,
  type ImportPreview,
  type OrgStructureEvent,
} from '../shared/api/org-structure-admin.js';
import { formatDate } from '../shared/formatDate.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageLayout, AdminSectionCard, FormField, OrgStructurePageHeader, type AdminNavItem } from '../shared/adminPage.js';
import { Badge, Button, DataTable, PageState, Pagination, type Column } from '../shared/ui.js';

type AdminOrgHistoryData = { items: OrgStructureEvent[]; total: number; page: number; pageSize: number };

/** "department" -> "Department"; "department_membership" -> "Department membership". */
function getEntityLabel(entityType: string, t: TFunction) {
  return t(`admin.orgTools.history.entities.${entityType}`, entityType);
}

/** "department.created" -> nested lookup at history.events.department.created (i18next treats the
 *  event type's own dot as a further nesting level, same as the translation key's dots). */
function getEventLabel(eventType: string, t: TFunction) {
  return t(`admin.orgTools.history.events.${eventType}`, eventType);
}

function getActorLabel(item: OrgStructureEvent, t: TFunction) {
  return item.actorName ?? t('admin.orgTools.history.systemActor', 'System');
}

export function AdminOrgStructureToolsPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();

  const [kind, setKind] = useState<ImportKind>('DEPARTMENTS');
  const [mode, setMode] = useState<ImportMode>('CREATE_ONLY');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  const { state, reload } = useAsyncData<AdminOrgHistoryData>(
    () => listOrgStructureHistory(historyPage),
    [historyPage],
    {
      unauthenticated: t('admin.orgTools.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.orgTools.history.loadError', 'Unable to load organization history.'),
    },
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      setPreview(await previewOrgStructureImport(file, kind, mode));
    } catch {
      setMessage({ tone: 'error', text: t('admin.orgTools.previewError', 'Unable to validate the CSV file.') });
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview?.token) return;
    setBusy(true);
    try {
      const result = await commitOrgStructureImport(preview.token);
      setMessage({ tone: 'success', text: t('admin.orgTools.commitSuccess', '{{count}} rows imported.', { count: result.imported }) });
      setPreview(null);
      setFile(null);
      setHistoryPage(1);
      await reload();
    } catch {
      setMessage({ tone: 'error', text: t('admin.orgTools.commitError', 'Import could not be committed. Preview again and resolve any conflicts.') });
    } finally {
      setBusy(false);
    }
  }

  const navItems: AdminNavItem[] = [
    { label: t('admin.nav.orgStructureTools', 'Import & history'), href: '/admin/org-structure-tools', isCurrent: true },
  ];

  const historyColumns: Column<OrgStructureEvent>[] = [
    { key: 'createdAt', label: t('admin.orgTools.history.colDate', 'Date'), priority: 'primary', render: (row) => formatDate(row.createdAt, undefined, { dateStyle: 'medium', timeStyle: 'short' }) },
    { key: 'eventType', label: t('admin.orgTools.history.colChange', 'Change'), priority: 'primary', render: (row) => getEventLabel(row.eventType, t) },
    { key: 'entityType', label: t('admin.orgTools.history.colEntity', 'Entity'), priority: 'secondary', render: (row) => getEntityLabel(row.entityType, t) },
    { key: 'actor', label: t('admin.orgTools.history.colActor', 'Actor'), priority: 'secondary', render: (row) => getActorLabel(row, t) },
  ];

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems} currentUser={currentUser ?? undefined}>
      <OrgStructurePageHeader current="importHistory" />

      <AdminSectionCard
        title={t('admin.orgTools.cardTitle', 'Organization structure import')}
        subtitle={t('admin.orgTools.cardSubtitle', 'CSV with departments, positions and managers')}
      >
        <form className="admin-form" onSubmit={submit}>
          <FormField id="org-import-kind" label={t('admin.orgTools.fieldKind', 'Import data')}>
            <select id="org-import-kind" value={kind} onChange={(e) => { setKind(e.target.value as ImportKind); setPreview(null); }}>
              <option value="DEPARTMENTS">{t('admin.orgTools.kindDepartments', 'Departments')}</option>
              <option value="MEMBERSHIPS">{t('admin.orgTools.kindMemberships', 'Memberships')}</option>
            </select>
          </FormField>
          <FormField id="org-import-mode" label={t('admin.orgTools.fieldMode', 'Mode')}>
            <select id="org-import-mode" value={mode} onChange={(e) => { setMode(e.target.value as ImportMode); setPreview(null); }}>
              <option value="CREATE_ONLY">{t('admin.orgTools.modeCreateOnly', 'Create only')}</option>
              <option value="UPSERT">{t('admin.orgTools.modeUpsert', 'Create or update')}</option>
            </select>
          </FormField>
          <FormField id="org-import-file" label={t('admin.orgTools.fieldFile', 'UTF-8 CSV file')} hint={t('admin.orgTools.fileHint', 'Maximum 5 MiB and 10,000 data rows.')}>
            <input
              id="org-import-file"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
            />
          </FormField>
          <Button type="submit" disabled={busy || !file}>
            {busy && !preview ? t('admin.orgTools.submitting', 'Validating…') : t('admin.orgTools.submit', 'Preview import')}
          </Button>
        </form>

        {preview || message ? (
          <div aria-live="polite" className="admin-org-tools__notice">
            {preview ? (
              <>
                <p>
                  <Badge variant={preview.valid ? 'done' : 'overdue'}>
                    {preview.valid
                      ? t('admin.orgTools.previewValid', '{{count}} rows valid', { count: preview.rowCount })
                      : t('admin.orgTools.previewInvalid', '{{count}} validation errors', { count: preview.errors.length })}
                  </Badge>
                </p>
                {preview.errors.length ? (
                  <ul className="admin-form__error-list">
                    {preview.errors.map((error, index) => (
                      <li key={index}>{t('admin.orgTools.previewErrorRow', 'Row {{row}}, {{field}}: {{message}}', { row: error.row, field: error.field, message: error.message })}</li>
                    ))}
                  </ul>
                ) : null}
                {preview.token ? (
                  <Button onClick={() => void commit()} disabled={busy} variant="primary">
                    {busy ? t('admin.orgTools.committing', 'Applying…') : t('admin.orgTools.commit', 'Commit validated import')}
                  </Button>
                ) : null}
              </>
            ) : null}
            {message ? <p className={message.tone === 'error' ? 'admin-form__error' : undefined} role="status">{message.text}</p> : null}
          </div>
        ) : null}

        <div className="admin-section-card__subhead">
          <h3>{t('admin.orgTools.historyTitle', 'Change history')}</h3>
          <p>{t('admin.orgTools.historySubtitle', 'Every import and manual change to the organization structure.')}</p>
        </div>

        {state.status === 'loading' ? (
          <PageState variant="loading" message={t('admin.orgTools.history.loading', 'Loading history…')} />
        ) : state.status !== 'loaded' ? (
          <PageState variant="error" message={state.message} />
        ) : (
          <>
            <DataTable<OrgStructureEvent>
              label={t('admin.orgTools.historyTitle', 'Change history')}
              columns={historyColumns}
              rows={state.data.items}
              keyExtractor={(row) => row.id}
              responsiveDetails={{
                label: t('courses.details'),
                expandLabel: (row) => `${t('courses.details')}: ${getEventLabel(row.eventType, t)}`,
                collapseLabel: (row) => `${t('courses.details')}: ${getEventLabel(row.eventType, t)}`,
              }}
              emptyMessage={t('admin.orgTools.history.empty', 'No history events yet.')}
            />
            <Pagination
              page={state.data.page}
              pageSize={ORG_STRUCTURE_HISTORY_PAGE_SIZE}
              total={state.data.total}
              onPage={setHistoryPage}
              label={t('admin.orgTools.history.paginationLabel', 'History pages')}
              prevLabel={t('admin.orgTools.history.prev', '← Prev')}
              nextLabel={t('admin.orgTools.history.next', 'Next →')}
            />
          </>
        )}
      </AdminSectionCard>
    </AdminPageLayout>
  );
}
