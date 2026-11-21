import { useState } from 'react';

import { ApiClientError, apiRequest } from '../../shared/apiClient.js';
import { checkRowsLocally, importLimits, readWorkbook, parseCsv, serverProblem, tableToRows, toApiRow, type FileFailure, type ImportColumn, type ImportProblem, type ImportRow, type Table } from './importFile.js';

export type RowStatus = 'ok' | 'bad' | 'created';
export type ImportRowState = ImportRow & { status: RowStatus; invitationDelivered?: boolean };
export type ImportPhase = 'empty' | 'parsed' | 'checking' | 'checked' | 'creating' | 'done';
export type ImportFailure = FileFailure | 'checkFailed' | 'createFailed' | 'forbidden';

type ServerReport = { rows: Array<{ index: number; status: string; errors: string[]; invitationDelivered?: boolean }> };

/** PR 492: the import flow: read the file, check it by the server without saving, create in parts of 100 rows. */
export function useUsersImport(organizationId: string, fieldNames: (column: ImportColumn) => string) {
  const [phase, setPhase] = useState<ImportPhase>('empty');
  const [rows, setRows] = useState<ImportRowState[]>([]);
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  const [fileName, setFileName] = useState('');

  async function readFile(file: File) {
    setFailure(null); setRows([]); setPhase('empty'); setFileName(file.name);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.csv')) return setFailure('fileWrongType');
    if (file.size > importLimits.maxFileBytes) return setFailure('fileTooBig');
    let table: Table;
    try {
      table = lower.endsWith('.csv') ? { rows: parseCsv(await file.text()), formulaCells: new Set() } : await readWorkbook(await file.arrayBuffer());
    } catch {
      return setFailure('fileUnreadable');
    }
    const parsed = tableToRows(table);
    if ('failure' in parsed) return setFailure(parsed.failure);
    setRows(checkRowsLocally(parsed.rows, fieldNames).map((row) => ({ ...row, status: row.problems.length > 0 ? 'bad' : 'ok' })));
    setPhase('parsed');
  }

  /** Sends the rows that are still fine, one part after another, and applies the server answer to each row. */
  async function run(mode: 'validateOnly' | 'create') {
    setFailure(null);
    setPhase(mode === 'create' ? 'creating' : 'checking');
    const next = rows.map((row) => ({ ...row }));
    const candidates = next.filter((row) => row.status === 'ok');
    try {
      for (let start = 0; start < candidates.length; start += importLimits.batchSize) {
        const part = candidates.slice(start, start + importLimits.batchSize);
        const report = await apiRequest<ServerReport>('/users/import', { method: 'POST', body: JSON.stringify({ organizationId, mode, users: part.map(toApiRow) }) });
        for (const entry of report.rows) {
          const row = part[entry.index];
          if (!row) continue;
          if (entry.errors.length > 0) {
            row.status = 'bad';
            row.problems = [...row.problems, ...entry.errors.map((message): ImportProblem => serverProblem(message))];
          } else if (entry.status === 'created') {
            row.status = 'created';
            if (entry.invitationDelivered !== undefined) row.invitationDelivered = entry.invitationDelivered;
          }
        }
      }
      setRows(next);
      setPhase(mode === 'create' ? 'done' : 'checked');
    } catch (error) {
      setRows(next);
      setPhase(mode === 'create' ? 'checked' : 'parsed');
      setFailure(error instanceof ApiClientError && error.status === 403 ? 'forbidden' : mode === 'create' ? 'createFailed' : 'checkFailed');
    }
  }

  return { phase, rows, failure, fileName, readFile, check: () => run('validateOnly'), create: () => run('create') };
}
