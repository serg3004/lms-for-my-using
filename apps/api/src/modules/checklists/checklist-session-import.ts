import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { z } from 'zod';

export const MAX_SESSION_IMPORT_BYTES = 1024 * 1024;
export const MAX_SESSION_IMPORT_ROWS = 100;
const MAX_EXPANDED_BYTES = 8 * 1024 * 1024;
export type SessionImportFile = { originalname: string; buffer: Buffer };
export type SessionImportReason = 'invalid_email' | 'duplicate' | 'outside_scope' | 'self_observer' | 'active_assignment' | 'scope_changed';
export type SessionImportRow = { row: number; email: string; status: 'ready' | 'skipped' | 'created'; reason?: SessionImportReason; employee?: { id: string; firstName: string; lastName: string; email: string }; sessionId?: string };
export function importFileError(reason: string): never { throw new BadRequestException(`session_import.${reason}`); }

/** Check actual inflated sizes before ExcelJS sees the workbook, including lying ZIP metadata. */
function validateWorkbookZip(buffer: Buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) importFileError('invalid_file');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (!count || count > 128 || buffer.readUInt16LE(end + 8) !== count || offset + buffer.readUInt32LE(end + 12) !== end) importFileError('invalid_file');
  let total = 0, cells = 0, sheetRows = 0;
  for (let entry = 0; entry < count; entry++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) importFileError('invalid_file');
    const flags = buffer.readUInt16LE(offset + 8), method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20), expanded = buffer.readUInt32LE(offset + 24);
    const local = buffer.readUInt32LE(offset + 42);
    const next = offset + 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    if ((flags & 1) || ![0, 8].includes(method) || next > end || local + 30 > offset || expanded > MAX_EXPANDED_BYTES - total || buffer.readUInt32LE(local) !== 0x04034b50) importFileError('invalid_file');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (start + compressed > offset) importFileError('invalid_file');
    try {
      const data = buffer.subarray(start, start + compressed);
      const expandedData = method === 8 ? inflateRawSync(data, { maxOutputLength: Math.max(1, MAX_EXPANDED_BYTES - total) }) : data;
      const actual = expandedData.length;
      if (actual !== expanded || actual > MAX_EXPANDED_BYTES - total) importFileError('invalid_file');
      const name = buffer.subarray(offset + 46, offset + 46 + buffer.readUInt16LE(offset + 28)).toString('utf8');
      if (name.endsWith('.xml') || name.endsWith('.rels')) {
        const xml = new TextDecoder('utf-8', { fatal: true }).decode(expandedData);
        if (xml.includes('\u0000') || /<!DOCTYPE/i.test(xml)) importFileError('invalid_file');
        const tags = /<(?:[\w]+:)?(c|row)(?=[\s>])[^>]*>/g;
        let tag: RegExpExecArray | null;
        while ((tag = tags.exec(xml))) {
          const reference = /\br\s*=\s*(["'])(.*?)\1/.exec(tag[0])?.[2];
          if (tag[1] === 'c') {
            if (++cells > MAX_SESSION_IMPORT_ROWS + 1) importFileError('rows_limit');
            if (reference && !/^A[1-9]\d{0,2}$/.test(reference)) importFileError('header');
            if (reference && Number(reference.slice(1)) > MAX_SESSION_IMPORT_ROWS + 1) importFileError('rows_limit');
          } else {
            if (++sheetRows > MAX_SESSION_IMPORT_ROWS + 1 || (reference && (!/^[1-9]\d{0,2}$/.test(reference) || Number(reference) > MAX_SESSION_IMPORT_ROWS + 1))) importFileError('rows_limit');
          }
        }
      }
      total += actual;
    } catch (error) { if (error instanceof BadRequestException) throw error; importFileError('invalid_file'); }
    offset = next;
  }
  if (offset !== end) importFileError('invalid_file');
}

function csvRows(buffer: Buffer): unknown[][] {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''); } catch { return importFileError('invalid_file'); }
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false;
  const addField = () => { row.push(field); field = ''; closed = false; if (row.length > 1) importFileError('header'); };
  const addRow = () => { addField(); rows.push(row); row = []; if (rows.length > MAX_SESSION_IMPORT_ROWS + 1) importFileError('rows_limit'); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ',' || char === ';') addField();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; addRow(); }
    else if (char === '"' && !field && !closed) quoted = true;
    else if (closed || char === '"') importFileError('invalid_file');
    else field += char;
    if (field.length > 320) importFileError('invalid_file');
  }
  if (quoted) importFileError('invalid_file');
  if (field || closed || row.length) addRow();
  return rows;
}

export async function parseSessionImport(file?: SessionImportFile): Promise<SessionImportRow[]> {
  if (!file?.buffer.length) importFileError('empty');
  if (file.buffer.length > MAX_SESSION_IMPORT_BYTES) importFileError('file_limit');
  const extension = file.originalname.split('.').at(-1)?.toLowerCase();
  let rows: unknown[][];
  if (extension === 'csv') rows = csvRows(file.buffer);
  else if (extension === 'xlsx') {
    validateWorkbookZip(file.buffer);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      if (workbook.worksheets.length !== 1) importFileError('one_sheet');
      const sheet = workbook.worksheets[0]!;
      if (sheet.rowCount > MAX_SESSION_IMPORT_ROWS + 1) importFileError('rows_limit');
      if (sheet.columnCount !== 1) importFileError('header');
      rows = Array.from({ length: sheet.rowCount }, (_, index) => [sheet.getRow(index + 1).getCell(1).value]);
    } catch (error) { if (error instanceof BadRequestException) throw error; return importFileError('invalid_file'); }
  } else return importFileError('format');
  if (rows[0]?.length !== 1 || typeof rows[0][0] !== 'string' || rows[0][0].trim().toLowerCase() !== 'email') importFileError('header');
  if (rows.length < 2) importFileError('empty');
  if (rows.length > MAX_SESSION_IMPORT_ROWS + 1) importFileError('rows_limit');
  const seen = new Set<string>();
  return rows.slice(1).map(([cell], index) => {
    // Excel formula/hyperlink/rich-text objects are never evaluated or used as identifiers.
    const raw = typeof cell === 'string' ? cell.trim() : '';
    const tooLong = raw.length > 254;
    const email = raw.slice(0, 254).toLowerCase();
    const reason = !email || tooLong || /^[=+@\t\r-]/.test(email) || !z.string().email().safeParse(email).success
      ? 'invalid_email' : seen.has(email) ? 'duplicate' : undefined;
    if (!reason) seen.add(email);
    return { row: index + 2, email: tooLong ? email + '…' : email, status: reason ? 'skipped' : 'ready', ...(reason ? { reason } : {}) };
  });
}
