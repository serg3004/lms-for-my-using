import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { orgImportFailures, orgImportRows } from '../../common/observability/metrics.js';
import { logOrgDiagnostic, orgFailureReason } from '../../common/observability/org-observability.js';
import { MAX_DEPARTMENT_DEPTH, newOperationId, recordOrgStructureEvent, runSerializableWithRetry } from '../departments/public.js';
import { parseCsv, rowsAsObjects } from './csv.js';
import type { ImportKind, ImportMode } from './org-structure-admin.schemas.js';

const DEPARTMENT_COLUMNS = ['code','name','parentCode','typeCode','sortOrder','directManagerMode','functionalManagerMode','directManagerUserIds','functionalManagerUserIds'] as const;
const MEMBERSHIP_COLUMNS = ['userId','departmentCode','membershipType','positionCode','effectiveFrom'] as const;
const CLEAR = '__CLEAR__';
const ROOT = '__ROOT__';
type Row = Record<string, string>;
type ValidationError = { row: number; field: string; message: string };

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class OrgStructureAdminService {
  private readonly logger = new Logger(OrgStructureAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async preview(file: Buffer, kind: ImportKind, mode: ImportMode, organizationId: string, actorId: string) {
    let rows: Row[];
    try {
      try { rows = rowsAsObjects(parseCsv(file), kind === 'DEPARTMENTS' ? DEPARTMENT_COLUMNS : MEMBERSHIP_COLUMNS); }
      catch (error) { if (error instanceof TypeError) throw new BadRequestException('CSV must be valid UTF-8'); throw error; }
      const errors = kind === 'DEPARTMENTS'
        ? await this.validateDepartments(rows, mode, organizationId)
        : await this.validateMemberships(rows, mode, organizationId);
      if (errors.length) {
        orgImportRows.inc({ kind, stage: 'preview', outcome: 'rejected' }, rows.length);
        orgImportFailures.inc({ kind, stage: 'preview', reason: 'validation' });
        logOrgDiagnostic(this.logger, 'org_import_failed', 'validation', { kind, stage: 'preview' });
        return { valid: false, rowCount: rows.length, errors };
      }

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      await this.prisma.orgStructureImportPreview.create({ data: {
        organizationId, actorId, tokenHash: tokenHash(token), kind, mode,
        payload: rows as Prisma.InputJsonValue, rowCount: rows.length, expiresAt,
      }});
      orgImportRows.inc({ kind, stage: 'preview', outcome: 'accepted' }, rows.length);
      return { valid: true, rowCount: rows.length, errors: [], token, expiresAt };
    } catch (error) {
      const reason = orgFailureReason(error);
      orgImportFailures.inc({ kind, stage: 'preview', reason });
      logOrgDiagnostic(this.logger, 'org_import_failed', reason, { kind, stage: 'preview' });
      throw error;
    }
  }

  async commit(token: string, organizationId: string, actorId: string) {
    let diagnosticKind: ImportKind | 'UNKNOWN' = 'UNKNOWN';
    let diagnosticRowCount = 0;
    try {
      const result = await runSerializableWithRetry(this.prisma, async (tx) => {
      const preview = await tx.orgStructureImportPreview.findUnique({ where: { tokenHash: tokenHash(token) } });
      if (!preview || preview.organizationId !== organizationId || preview.actorId !== actorId) throw new ForbiddenException('Import token is invalid for this actor or organization');
      diagnosticKind = preview.kind as ImportKind;
      diagnosticRowCount = preview.rowCount;
      if (preview.expiresAt <= new Date()) throw new GoneException('Import token has expired');
      if (preview.consumedAt) throw new ConflictException('Import token has already been used');
      const claimed = await tx.orgStructureImportPreview.updateMany({ where: { id: preview.id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictException('Import token has already been used');
      const rows = preview.payload as Row[];
      const errors = preview.kind === 'DEPARTMENTS'
        ? await this.validateDepartments(rows, preview.mode as ImportMode, organizationId, tx)
        : await this.validateMemberships(rows, preview.mode as ImportMode, organizationId, tx);
      if (errors.length) throw new ConflictException({ message: 'Import no longer matches current data', errors });
      const operationId = newOperationId();
      if (preview.kind === 'DEPARTMENTS') await this.applyDepartments(tx, rows, preview.mode as ImportMode, organizationId, actorId, operationId);
      else await this.applyMemberships(tx, rows, preview.mode as ImportMode, organizationId, actorId, operationId);
      await recordOrgStructureEvent(tx, { organizationId, actorId, entityType: 'org_structure_import', entityId: preview.id,
        eventType: 'org_structure.import_committed', operationId, metadata: { kind: preview.kind, mode: preview.mode, rowCount: rows.length } });
      return { imported: rows.length, kind: preview.kind, mode: preview.mode, operationId };
      });
      orgImportRows.inc({ kind: result.kind, stage: 'commit', outcome: 'accepted' }, result.imported);
      return result;
    } catch (error) {
      const reason = orgFailureReason(error);
      if (diagnosticRowCount > 0) orgImportRows.inc({ kind: diagnosticKind, stage: 'commit', outcome: 'rejected' }, diagnosticRowCount);
      orgImportFailures.inc({ kind: diagnosticKind, stage: 'commit', reason });
      logOrgDiagnostic(this.logger, 'org_import_failed', reason, { kind: diagnosticKind, stage: 'commit' });
      throw error;
    }
  }

  async history(organizationId: string, query: { entityType?: string; entityId?: string; page: number; pageSize: number }) {
    const where = { organizationId, ...(query.entityType ? { entityType: query.entityType } : {}), ...(query.entityId ? { entityId: query.entityId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.orgStructureEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        select: { id: true, actorId: true, entityType: true, entityId: true, eventType: true, operationId: true, metadata: true, createdAt: true } }),
      this.prisma.orgStructureEvent.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private async validateDepartments(rows: Row[], mode: ImportMode, organizationId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const errors: ValidationError[] = []; const codes = new Set<string>();
    const existing = await db.department.findMany({ where: { organizationId }, select: { code: true, status: true, parent: { select: { code: true } } } });
    const existingByCode = new Map(existing.filter(x => x.code).map(x => [x.code!, x]));
    const types = new Map((await db.departmentType.findMany({ where: { organizationId }, select: { code: true, isActive: true } })).map(x => [x.code, x]));
    const managerIds = [...new Set(rows.flatMap(row => [row.directManagerUserIds, row.functionalManagerUserIds].flatMap(value => value && value !== CLEAR ? value.split(';') : [])).filter(Boolean))];
    const activeManagers = new Set((await db.user.findMany({ where: { organizationId, id: { in: managerIds.filter(id => UUID_RE.test(id)) }, status: 'active' }, select: { id: true } })).map(user => user.id));
    const resultingParent = new Map(existing.filter(x => x.code).map(x => [x.code!, x.parent?.code ?? null]));
    rows.forEach((row, i) => {
      const n = i + 2; const code = row.code!;
      if (!code || code.length > 60) errors.push({ row: n, field: 'code', message: 'Code is required and must be at most 60 characters' });
      if (!row.name || row.name.length > 160) errors.push({ row: n, field: 'name', message: 'Name is required and must be at most 160 characters' });
      if (codes.has(code)) errors.push({ row: n, field: 'code', message: 'Duplicate code in file' }); codes.add(code);
      if (mode === 'CREATE_ONLY' && existingByCode.has(code)) errors.push({ row: n, field: 'code', message: 'Department already exists' });
      if (existingByCode.get(code)?.status === 'archived') errors.push({ row: n, field: 'code', message: 'Archived department cannot be updated' });
      if (row.typeCode && row.typeCode !== CLEAR && !types.get(row.typeCode)?.isActive) errors.push({ row: n, field: 'typeCode', message: 'Department type is unknown or archived' });
      if (row.sortOrder && (!/^\d+$/.test(row.sortOrder) || Number(row.sortOrder) > 1_000_000)) errors.push({ row: n, field: 'sortOrder', message: 'Invalid sort order' });
      for (const field of ['directManagerMode','functionalManagerMode']) if (row[field] && !['LOCAL','INHERIT','MERGE'].includes(row[field]!)) errors.push({ row: n, field, message: 'Invalid manager mode' });
      for (const field of ['directManagerUserIds','functionalManagerUserIds']) { const ids = row[field] && row[field] !== CLEAR ? row[field]!.split(';').filter(Boolean) : [];
        if (new Set(ids).size !== ids.length) errors.push({ row: n, field, message: 'Duplicate manager' });
        if (ids.some(id => !activeManagers.has(id))) errors.push({ row: n, field, message: 'Manager is unknown or inactive' });
      }
      if (row.parentCode === ROOT) resultingParent.set(code, null); else if (row.parentCode) resultingParent.set(code, row.parentCode); else if (!existingByCode.has(code)) resultingParent.set(code, null);
    });
    for (const [code, parent] of resultingParent) {
      if (parent && !resultingParent.has(parent)) errors.push({ row: (rows.findIndex(r => r.code === code) + 2) || 2, field: 'parentCode', message: `Unknown parent ${parent}` });
      else if (parent && existingByCode.get(parent)?.status === 'archived') errors.push({ row: (rows.findIndex(r => r.code === code) + 2) || 2, field: 'parentCode', message: `Archived department cannot be used as parent: ${parent}` });
      const seen = new Set<string>(); let cursor: string | null | undefined = code; let depth = 0;
      while (cursor) { if (seen.has(cursor)) { errors.push({ row: Math.max(2, rows.findIndex(r => r.code === code) + 2), field: 'parentCode', message: 'Cycle detected' }); break; } seen.add(cursor); cursor = resultingParent.get(cursor); depth += 1; if (depth > MAX_DEPARTMENT_DEPTH) { errors.push({ row: Math.max(2, rows.findIndex(r => r.code === code) + 2), field: 'parentCode', message: `Depth exceeds ${MAX_DEPARTMENT_DEPTH}` }); break; } }
    }
    return errors;
  }

  private async validateMemberships(rows: Row[], mode: ImportMode, organizationId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const errors: ValidationError[] = []; const intents = new Set<string>();
    const userIds = [...new Set(rows.map(r => r.userId))]; const validUserIds = userIds.filter(id => UUID_RE.test(id ?? '')); const departmentCodes = [...new Set(rows.map(r => r.departmentCode))]; const positionCodes = [...new Set(rows.map(r => r.positionCode).filter(Boolean))];
    const [users, departments, positions, current] = await Promise.all([
      db.user.findMany({ where: { organizationId, id: { in: validUserIds } }, select: { id: true, status: true } }),
      db.department.findMany({ where: { organizationId, code: { in: departmentCodes } }, select: { id: true, code: true, status: true } }),
      db.position.findMany({ where: { organizationId, code: { in: positionCodes } }, select: { id: true, code: true, status: true } }),
      db.departmentMembership.findMany({ where: { organizationId, effectiveTo: null, userId: { in: validUserIds } }, select: { userId: true, department: { select: { code: true } }, isPrimary: true, effectiveFrom: true } }),
    ]);
    const us = new Map(users.map(x => [x.id, x])); const ds = new Map(departments.map(x => [x.code!, x])); const ps = new Map(positions.map(x => [x.code, x]));
    rows.forEach((row, i) => { const n = i + 2; const intent = `${row.userId}:${row.departmentCode}`;
      if (intents.has(intent)) errors.push({ row: n, field: 'userId', message: 'Duplicate membership intent' }); intents.add(intent);
      if (!us.has(row.userId!) || us.get(row.userId!)!.status !== 'active') errors.push({ row: n, field: 'userId', message: 'User is unknown or inactive' });
      if (!ds.has(row.departmentCode!) || ds.get(row.departmentCode!)!.status !== 'active') errors.push({ row: n, field: 'departmentCode', message: 'Department is unknown or archived' });
      if (!['PRIMARY','ADDITIONAL'].includes(row.membershipType!)) errors.push({ row: n, field: 'membershipType', message: 'Must be PRIMARY or ADDITIONAL' });
      if (row.positionCode && (!ps.has(row.positionCode) || ps.get(row.positionCode)!.status !== 'active')) errors.push({ row: n, field: 'positionCode', message: 'Position is unknown or archived' });
      if (row.effectiveFrom && Number.isNaN(Date.parse(row.effectiveFrom))) errors.push({ row: n, field: 'effectiveFrom', message: 'Invalid date' });
      const same = current.find(x => x.userId === row.userId && x.department.code === row.departmentCode);
      if (mode === 'CREATE_ONLY' && same) errors.push({ row: n, field: 'departmentCode', message: 'Current membership already exists' });
      const priorPrimary = current.find(x => x.userId === row.userId && x.isPrimary);
      if (mode === 'CREATE_ONLY' && row.membershipType === 'PRIMARY' && priorPrimary) errors.push({ row: n, field: 'membershipType', message: 'User already has a primary membership' });
      if (mode === 'UPSERT' && row.membershipType === 'PRIMARY' && priorPrimary && priorPrimary.department.code !== row.departmentCode && row.effectiveFrom) {
        const newFrom = Date.parse(row.effectiveFrom);
        if (!Number.isNaN(newFrom) && newFrom < priorPrimary.effectiveFrom.getTime()) errors.push({ row: n, field: 'effectiveFrom', message: 'Effective date cannot be earlier than the current primary membership it would replace' });
      }
    }); return errors;
  }

  private async applyDepartments(tx: Prisma.TransactionClient, rows: Row[], mode: ImportMode, organizationId: string, actorId: string, operationId: string) {
    const types = new Map((await tx.departmentType.findMany({ where: { organizationId }, select: { id: true, code: true } })).map(x => [x.code, x.id]));
    const byCode = new Map((await tx.department.findMany({ where: { organizationId, code: { not: null } }, select: { id: true, code: true } })).map(x => [x.code!, x.id]));
    for (const row of rows) if (!byCode.has(row.code!)) { const created = await tx.department.create({ data: { organizationId, code: row.code!, name: row.name!, sortOrder: row.sortOrder ? Number(row.sortOrder) : 0, departmentTypeId: row.typeCode ? types.get(row.typeCode) : null, directManagerMode: (row.directManagerMode || 'LOCAL') as never, functionalManagerMode: (row.functionalManagerMode || 'LOCAL') as never } }); byCode.set(row.code!, created.id); }
    for (const row of rows) { const id = byCode.get(row.code!)!; const existsBefore = await tx.orgStructureEvent.findFirst({ where: { organizationId, entityId: id, eventType: 'department.created' }, select: { id: true } });
      const data: Prisma.DepartmentUpdateInput = { parent: row.parentCode === ROOT ? { disconnect: true } : row.parentCode ? { connect: { id_organizationId: { id: byCode.get(row.parentCode)!, organizationId } } } : undefined,
        ...(mode === 'UPSERT' ? { name: row.name || undefined, sortOrder: row.sortOrder ? Number(row.sortOrder) : undefined, departmentType: row.typeCode === CLEAR ? { disconnect: true } : row.typeCode ? { connect: { id_organizationId: { id: types.get(row.typeCode)!, organizationId } } } : undefined, directManagerMode: (row.directManagerMode || undefined) as never, functionalManagerMode: (row.functionalManagerMode || undefined) as never } : {}) };
      await tx.department.update({ where: { id }, data });
      for (const [field, type] of [['directManagerUserIds', 'DIRECT'], ['functionalManagerUserIds', 'FUNCTIONAL']] as const) {
        if (!row[field]) continue;
        await tx.departmentManager.updateMany({ where: { organizationId, departmentId: id, type, effectiveTo: null }, data: { effectiveTo: new Date() } });
        if (row[field] !== CLEAR) { const ids = row[field]!.split(';').filter(Boolean); for (const [index, userId] of ids.entries()) await tx.departmentManager.create({ data: { organizationId, departmentId: id, userId, type, isPrimary: index === 0 } }); }
      }
      await recordOrgStructureEvent(tx, { organizationId, actorId, entityType: 'department', entityId: id, eventType: existsBefore ? 'department.updated' : 'department.created', operationId, metadata: { source: 'csv_import', code: row.code } }); }
  }

  private async applyMemberships(tx: Prisma.TransactionClient, rows: Row[], mode: ImportMode, organizationId: string, actorId: string, operationId: string) {
    const departments = new Map((await tx.department.findMany({ where: { organizationId }, select: { id: true, code: true } })).map(x => [x.code!, x.id]));
    const positions = new Map((await tx.position.findMany({ where: { organizationId }, select: { id: true, code: true } })).map(x => [x.code, x.id]));
    for (const row of rows) { const departmentId = departments.get(row.departmentCode!)!; const current = await tx.departmentMembership.findFirst({ where: { organizationId, userId: row.userId, departmentId, effectiveTo: null } });
      if (current && mode === 'UPSERT') { await tx.departmentMembership.update({ where: { id: current.id }, data: { positionId: row.positionCode ? positions.get(row.positionCode) : undefined } }); continue; }
      if (row.membershipType === 'PRIMARY') {
        const priorPrimary = await tx.departmentMembership.findFirst({ where: { organizationId, userId: row.userId, isPrimary: true, effectiveTo: null } });
        if (priorPrimary) {
          await tx.departmentMembership.update({ where: { id: priorPrimary.id }, data: { effectiveTo: new Date(row.effectiveFrom || Date.now()) } });
          await recordOrgStructureEvent(tx, { organizationId, actorId, entityType: 'department_membership', entityId: priorPrimary.id, eventType: 'department_membership.closed', operationId, metadata: { source: 'csv_import', reason: 'primary_replaced' } });
        }
      }
      const created = await tx.departmentMembership.create({ data: { organizationId, userId: row.userId!, departmentId, positionId: row.positionCode ? positions.get(row.positionCode) : null, isPrimary: row.membershipType === 'PRIMARY', effectiveFrom: new Date(row.effectiveFrom || Date.now()) } });
      await recordOrgStructureEvent(tx, { organizationId, actorId, entityType: 'department_membership', entityId: created.id, eventType: 'department_membership.created', operationId, metadata: { source: 'csv_import' } }); }
  }
}
