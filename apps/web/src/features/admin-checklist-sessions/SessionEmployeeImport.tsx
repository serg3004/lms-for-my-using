import type { TFunction } from 'i18next';
import { ApiClientError } from '../../shared/apiClient.js';
import type { SessionImportRow } from '../../shared/api/checklistSessions.js';
import { Button, Input } from '../../shared/ui.js';

export function sessionImportError(error: unknown, t: TFunction): string {
  if (error instanceof ApiClientError) {
    if (error.status === 413) return t('sessionImport.errors.file_limit');
    if (error.message.startsWith('session_import.')) return t(`sessionImport.errors.${error.message.slice('session_import.'.length)}`, t('sessionImport.errors.invalid_file'));
  }
  return t('sessionImport.errors.request');
}

export function SessionImportReport({ rows, t }: { rows: SessionImportRow[]; t: TFunction }) {
  return <div role="region" aria-label={t('sessionImport.report')}>
    <p role="status">{t('sessionImport.summary', { accepted: rows.filter((row) => row.status !== 'skipped').length, skipped: rows.filter((row) => row.status === 'skipped').length })}</p>
    <ol style={{ paddingLeft: 24, overflowWrap: 'anywhere' }}>{rows.map((row) => <li key={row.row}>
      {t('sessionImport.row', { row: row.row })}: {row.email || '—'} — {row.reason ? t(`sessionImport.reasons.${row.reason}`) : t(`sessionImport.${row.status}`)}
    </li>)}</ol>
  </div>;
}

export function SessionEmployeeImport({ file, busy, error, rows, onFile, onPreview, t }: {
  file: File | null; busy: boolean; error: string | null; rows: SessionImportRow[] | null;
  onFile: (file: File | null) => void; onPreview: () => void; t: TFunction;
}) {
  return <section aria-label={t('sessionImport.title')}>
    <p>{t('sessionImport.instructions')}</p>
    <Input label={t('sessionImport.file')} type="file" accept=".csv,.xlsx" disabled={busy} onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
    <Button type="button" variant="secondary" disabled={!file || busy} onClick={onPreview}>{busy ? t('sessionImport.loading') : t('sessionImport.preview')}</Button>
    {error && <p role="alert">{error}</p>}
    {rows && <SessionImportReport rows={rows} t={t} />}
  </section>;
}
