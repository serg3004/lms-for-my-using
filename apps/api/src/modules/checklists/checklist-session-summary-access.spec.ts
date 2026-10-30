import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';
import type { ChecklistsService } from './checklists.service.js';
import type { ChecklistSessionReport } from './checklist-session-report.js';
import { ChecklistSessionService } from './checklist-session.service.js';

const fixture = JSON.parse(readFileSync(new URL('../../../../../tests/fixtures/checklist-session-summary-5s.json', import.meta.url), 'utf8'));
function visibleReport(): ChecklistSessionReport {
  const report = structuredClone(fixture.report);
  for (const key of ['scheduledStart', 'scheduledEnd', 'startedAt', 'completedAt']) report.header[key] = new Date(report.header[key]);
  return report;
}
const actor = { id: 'actor', locale: 'ru', isAdmin: false };
const viewer = { isLearnerOnly: false, feedbackVisibility: 'live' as const };
function harness() {
  const selected = [{ id: fixture.report.sessionId, status: 'completed', instance: { checklistId: 'sheet' } }];
  const findMany = jest.fn<() => Promise<typeof selected>>().mockResolvedValue(selected);
  const count = jest.fn<() => Promise<number>>().mockResolvedValue(1);
  const audit = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const service = new ChecklistSessionService({ checklistSession: { findMany, count } } as unknown as PrismaService,
    {} as ChecklistsService, { recordRequired: audit } as unknown as AuditLogService);
  const report = jest.spyOn(service, 'getReport').mockResolvedValue(visibleReport());
  return { service, findMany, count, audit, report, selected };
}
const query = { ids: [fixture.report.sessionId], format: 'xlsx' as const };
describe('summary selection security and audit (PR 373)', () => {
  it('ANDs team and soft-deletion scopes, reuses the report without fetching coordinates, and durably audits the complete selection', async () => {
    const h = harness(); const scope = { instance: { userId: 'team-member' } };
    const result = await h.service.exportSummary('org', query, scope, viewer, actor);
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [
      { id: { in: query.ids }, organizationId: 'org', deletedAt: null }, { AND: [scope, { instance: { deletedAt: null } }] },
    ] } }));
    expect(h.report).toHaveBeenCalledWith(query.ids[0], 'org', { AND: [scope, { instance: { deletedAt: null } }] }, viewer, actor, { includeLocation: false });
    expect(h.count).toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_session.summary_exported', actorId: 'actor', metadata: { sessionIds: query.ids, format: 'xlsx', locale: 'ru', rowCount: result.rows.length } }));
    expect(result.filename).toMatch(/\.xlsx$/);
    expect(JSON.stringify(result)).not.toMatch(/latitude|longitude|@example.invalid/);
  });
  it('fails mixed accessible/unavailable selections before loading reports, without an export audit', async () => {
    const h = harness();
    await expect(h.service.exportSummary('org', { ...query, ids: [...query.ids, 'other'] }, {}, viewer, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.report).not.toHaveBeenCalled(); expect(h.audit).not.toHaveBeenCalled();
  });
  it('rejects duplicate/oversized selections before querying, unfinished sessions and mixed sheets', async () => {
    const h = harness();
    for (const ids of [[], Array(51).fill('x'), ['x', 'x']]) await expect(h.service.exportSummary('org', { ...query, ids }, {}, viewer, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.findMany).not.toHaveBeenCalled();
    h.selected[0]!.status = 'scheduled';
    await expect(h.service.exportSummary('org', query, {}, viewer, actor)).rejects.toThrow('session_summary.completed_only');
    h.selected[0]!.status = 'completed'; h.selected.push({ id: 'other', status: 'completed', instance: { checklistId: 'other' } });
    await expect(h.service.exportSummary('org', { ...query, ids: [...query.ids, 'other'] }, {}, viewer, actor)).rejects.toThrow('session_summary.one_checklist');
    expect(h.report).not.toHaveBeenCalled(); expect(h.audit).not.toHaveBeenCalled();
  });
  it('does not release hidden learner results or a selection deleted while the report was built', async () => {
    const h = harness();
    h.report.mockResolvedValueOnce({ ...visibleReport(), visible: false } as ChecklistSessionReport);
    await expect(h.service.exportSummary('org', query, {}, viewer, actor)).rejects.toBeInstanceOf(ForbiddenException);
    h.count.mockResolvedValueOnce(0);
    await expect(h.service.exportSummary('org', query, {}, viewer, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('returns no file when durable audit fails or the input row cap is exceeded', async () => {
    const h = harness(); h.audit.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(h.service.exportSummary('org', query, {}, viewer, actor)).rejects.toThrow('audit unavailable');
    h.audit.mockClear();
    const report = visibleReport(); report.criteria = Array(5001).fill(report.criteria[0]!);
    h.report.mockResolvedValueOnce(report);
    await expect(h.service.exportSummary('org', query, {}, viewer, actor)).rejects.toThrow('session_summary.row_limit');
    expect(h.audit).not.toHaveBeenCalled();
  });
});
