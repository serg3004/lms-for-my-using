import { useTranslation } from 'react-i18next';

import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { downloadCsvFile, downloadXlsxFile } from '../shared/downloadCsv.js';
import { useSession } from '../shared/session.js';
import { DataTable, type Column } from '../shared/ui.js';
import { importLimits, templateRows, toCsv, type ImportColumn, type ImportProblem } from '../features/admin-users-import/importFile.js';
import { useUsersImport, type ImportRowState } from '../features/admin-users-import/useUsersImport.js';

const shownProblems = 200;
const locales = ['en', 'ru', 'kk', 'zh'] as const;

/** PR 492: import of people from an Excel or CSV file: template, file, server check, creation with invitations, report. */
export function AdminUsersImportPage() {
  const { t, i18n } = useTranslation();
  const { currentUser } = useSession();
  const locale = locales.find((code) => i18n.language.startsWith(code)) ?? 'en';
  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
    { label: t('admin.users.title', 'Users'), href: '/admin/users' },
    { label: t('usersImport.title'), href: '/admin/users/import', isCurrent: true },
  ];
  const fieldName = (column: ImportColumn) => t(`usersImport.columns.${column}`);
  const flow = useUsersImport(currentUser?.organizationId ?? '', fieldName);

  const text = (problem: ImportProblem) => problem.key === 'raw' ? String(problem.params?.['message'] ?? '') : t(`usersImport.problem.${problem.key}`, problem.params);
  const bad = flow.rows.filter((row) => row.status === 'bad');
  const ok = flow.rows.filter((row) => row.status === 'ok');
  const created = flow.rows.filter((row) => row.status === 'created');
  const unsent = created.filter((row) => row.invitationDelivered === false).length;
  const busy = flow.phase === 'checking' || flow.phase === 'creating';

  const columns: Column<ImportRowState>[] = [
    { key: 'line', label: t('usersImport.colRow'), priority: 'primary', render: (row) => row.line },
    { key: 'email', label: t('usersImport.colEmail'), priority: 'secondary', render: (row) => row.values.email ?? '—' },
    { key: 'problem', label: t('usersImport.colProblem'), priority: 'primary', render: (row) => row.problems.map(text).join(' ') },
  ];

  function downloadTemplate(kind: 'xlsx' | 'csv') {
    const rows = templateRows(locale);
    const name = t('usersImport.templateFile');
    if (kind === 'csv') downloadCsvFile(`${name}.csv`, toCsv(rows));
    else void downloadXlsxFile(`${name}.xlsx`, rows, name, { styled: true });
  }

  function downloadReport() {
    const status = (row: ImportRowState) => t(`usersImport.reportStatus.${row.status === 'created' ? 'created' : 'skipped'}`);
    const rows = [[t('usersImport.colRow'), t('usersImport.colEmail'), t('usersImport.doneTitle'), t('usersImport.colProblem')],
      ...flow.rows.map((row) => [String(row.line), row.values.email ?? '', status(row), row.problems.map(text).join(' ')])];
    downloadCsvFile(`${t('usersImport.templateFile')}-report.csv`, toCsv(rows));
  }

  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
    <AdminPageHeader eyebrow={t('usersImport.eyebrow')} title={t('usersImport.title')} subtitle={t('usersImport.subtitle')} />
    <AdminCard>
      <h2>{t('usersImport.templateTitle')}</h2>
      <p>{t('usersImport.templateHint')}</p>
      <p>{t('usersImport.limits', { rows: importLimits.maxRows, mb: importLimits.maxFileBytes / 1024 / 1024, batch: importLimits.batchSize })}</p>
      <div className="td-actions">
        <button className="admin-btn admin-btn--secondary" type="button" onClick={() => downloadTemplate('xlsx')}>{t('usersImport.templateXlsx')}</button>
        <button className="admin-btn admin-btn--secondary" type="button" onClick={() => downloadTemplate('csv')}>{t('usersImport.templateCsv')}</button>
      </div>
    </AdminCard>
    <AdminCard>
      <h2>{t('usersImport.fileTitle')}</h2>
      <label htmlFor="users-import-file">{t('usersImport.chooseFile')}</label>
      <input id="users-import-file" type="file" accept=".xlsx,.csv" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void flow.readFile(file); event.target.value = ''; }} />
      {flow.fileName ? <p>{flow.fileName}</p> : null}
      {flow.failure ? <p className="admin-form__error" role="alert">{t(`usersImport.${flow.failure}`, { mb: importLimits.maxFileBytes / 1024 / 1024, rows: importLimits.maxRows })}</p> : null}
      {flow.phase !== 'empty' ? <p role="status">{t('usersImport.rowsInFile', { count: flow.rows.length })}</p> : null}
    </AdminCard>
    {flow.phase !== 'empty' ? <AdminCard>
      <h2>{t('usersImport.checkTitle')}</h2>
      {flow.phase === 'checked' || flow.phase === 'creating' || flow.phase === 'parsed' ? <p role="status">{t('usersImport.checkResult', { ok: ok.length, bad: bad.length })}</p> : null}
      {flow.phase === 'done' ? <p role="status">{t('usersImport.doneSummary', { created: created.length, failed: bad.length + ok.length })}</p> : null}
      {unsent > 0 ? <p role="status">{t('usersImport.notDelivered', { count: unsent })}</p> : null}
      {bad.length > 0 ? <>
        <h3>{t('usersImport.problemsTitle')}</h3>
        <DataTable label={t('usersImport.problemsTitle')} columns={columns} density="dense" rows={bad.slice(0, shownProblems)} keyExtractor={(row) => String(row.line)} emptyMessage={t('usersImport.noProblems')} responsiveDetails={{ label: t('courses.details'), expandLabel: (row) => `${t('courses.details')}: ${row.line}`, collapseLabel: (row) => `${t('courses.details')}: ${row.line}` }} />
        {bad.length > shownProblems ? <p>{t('usersImport.moreProblems', { count: bad.length - shownProblems })}</p> : null}
      </> : flow.phase !== 'done' ? <p>{t('usersImport.noProblems')}</p> : null}
      <div className="td-actions">
        {flow.phase !== 'done' ? <button className="admin-btn admin-btn--secondary" type="button" disabled={busy || ok.length === 0} onClick={() => void flow.check()}>{flow.phase === 'checking' ? t('usersImport.checking') : t('usersImport.check')}</button> : null}
        {flow.phase === 'checked' || flow.phase === 'creating' ? <button className="admin-btn admin-btn--primary" type="button" disabled={busy || ok.length === 0} onClick={() => void flow.create()}>{flow.phase === 'creating' ? t('usersImport.creating') : t('usersImport.create', { count: ok.length })}</button> : null}
        {flow.phase === 'done' ? <button className="admin-btn admin-btn--secondary" type="button" onClick={downloadReport}>{t('usersImport.downloadReport')}</button> : null}
      </div>
    </AdminCard> : null}
  </AdminPageLayout>;
}
