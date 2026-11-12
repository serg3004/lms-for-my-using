import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { matchPublicChecklistRoute } from '../../common/middleware/api-hardening.js';
import { rolePolicies } from '../auth/roles.js';
import { analyticsEmployeeFilter, buildSheetAnalytics, type AnalyticsInstance } from './checklist-sheet-analytics.js';
import { sheetsExportRows } from './checklist-analytics-export.js';

/**
 * PR 468: acceptance guard for gaps 42-44 of docs/product/future/CHECKLIST_ANALYTICS_TAB_PLAN.md (block 2: the link and QR entry).
 * It fails when a later change lets a non-administrator switch the entry on or reissue the link, opens another sheet or
 * another guest's pass to a guest, writes the token to the audit log, drops the code check or the rate limit, turns guest
 * photos on by default, or lets guests into a department, a manager's team or a differently-scoped view.
 */

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const controller = read('apps/api/src/modules/checklists/checklists.controller.ts');
const publicController = read('apps/api/src/modules/checklists/checklist-public.controller.ts');
const publicService = read('apps/api/src/modules/checklists/checklist-public.service.ts');
const publicAccess = read('apps/api/src/modules/checklists/checklist-public-access.ts');
const schema = read('apps/api/prisma/schema.prisma');

describe('link and QR entry: only an administrator sets it up (gap 42)', () => {
  it('lets only the administrator change the settings and reissue the link', () => {
    expect([...rolePolicies.checklistAccessSettingsWrite]).toEqual(['admin']);
  });
  it.each([["@Patch('checklists/:id/public-access')"], ["@Post('checklists/:id/public-access/reissue')"]])('guards %s with the administrator policy', (route) => {
    const at = controller.indexOf(route);
    expect(at).toBeGreaterThan(-1);
    expect(controller.slice(at, at + 120)).toContain('@Roles(...rolePolicies.checklistAccessSettingsWrite)');
  });
  it('shows the token only to an administrator when the settings are read', () => {
    expect(publicAccess).toMatch(/isAdmin|roles\.includes\('admin'\)/);
  });
});

describe('link and QR entry: what a guest can reach (gap 43)', () => {
  it('serves every guest route without an account except signing in as an employee, which is guarded', () => {
    const routes = [...publicController.matchAll(/@(Get|Post|Patch)\('([^']+)'\)\n((?: {2}@[^\n]+\n)+)/g)];
    expect(routes.length).toBeGreaterThanOrEqual(9);
    for (const [, , path, decorators] of routes) {
      if (path === ':token/start-signed-in') expect(decorators).toContain('@UseGuards(AuthGuard, RolesGuard)');
      else expect(decorators).toContain('@PublicAccess()');
    }
  });
  it('ties every pass to its sheet, its guest user and its key, and answers "not found" otherwise', () => {
    expect(publicService).toContain('checklistId: sheet.id, userId: guest.id');
    expect(publicService).toContain('isGuestPassKey');
    expect(publicService).toContain('throw notFound()');
  });
  it('keeps the token out of the audit log and out of the rate-limit key', () => {
    for (const line of publicAccess.split('\n').filter((row) => row.includes('metadata:'))) expect(line.toLowerCase()).not.toContain('token');
    const limited = matchPublicChecklistRoute('POST', '/api/v1/public/checklists/SECRET-TOKEN/start');
    expect(limited?.route).toBe('/api/v1/public/checklists/:token/start');
    expect(JSON.stringify(limited)).not.toContain('SECRET-TOKEN');
  });
  it('checks the picture code when a pass starts and when it is sent, and limits starts, sends, saves and opens', () => {
    expect(publicService.match(/this\.checkCaptcha\(input\.captchaChallenge, input\.captchaCode\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(matchPublicChecklistRoute('GET', '/api/v1/public/checklists/t')?.kind).toBe('open');
    expect(matchPublicChecklistRoute('POST', '/api/v1/public/checklists/t/start')?.kind).toBe('start');
    expect(matchPublicChecklistRoute('POST', '/api/v1/public/checklists/t/passes/p/finish')?.kind).toBe('finish');
    expect(matchPublicChecklistRoute('PATCH', '/api/v1/public/checklists/t/passes/p/items/i')?.kind).toBe('pass');
    expect(schema).toMatch(/publicDailyLimit\s+Int\s+@default\(200\)/);
  });
  it('keeps guest photos off by default and refuses them on the server regardless of the screen', () => {
    expect(schema).toMatch(/guestPhotosAllowed\s+Boolean\s+@default\(false\)/);
    expect(publicService).toContain("Photos are not allowed for guests on this checklist");
  });
});

describe('link and QR entry: guests in results and analytics (gap 44)', () => {
  const instance = (guest: boolean, percentage: number): AnalyticsInstance => ({
    checklistId: 's1', sessionStatus: null, scheduledAt: null, instanceStatus: 'completed', percentage, scored: true, guest, snapshot: null, results: [],
  });
  it('counts guests inside the totals and gives them their own line', () => {
    const { total, sheets } = buildSheetAnalytics([{ id: 's1', title: 'Sheet' }], [instance(true, 100), instance(true, 50), instance(false, 90)], [], new Date('2026-11-12T00:00:00Z'));
    expect(total.selfCompleted).toBe(3);
    expect(total.averagePercentage).toBe(80);
    expect(total.guests).toEqual({ completed: 2, averagePercentage: 75 });
    expect(sheets[0]!.guests.completed).toBe(2);
  });
  it('shows no guest line when nobody came by the link', () => {
    expect(buildSheetAnalytics([{ id: 's1', title: 'Sheet' }], [instance(false, 90)], [], new Date()).total.guests).toEqual({ completed: 0, averagePercentage: null });
  });
  it('keeps guests out of a department or a manager: they belong to none, so those filters never match them', () => {
    const filter = analyticsEmployeeFilter('org', {}, { departmentId: 'd1', managerId: 'm1' }) as { AND: Array<Record<string, unknown>> };
    const withDepartment = filter.AND.filter((part) => 'departmentMemberships' in part);
    expect(withDepartment.length).toBe(2);
    for (const part of withDepartment) expect(JSON.stringify(part)).toContain('"some"');
  });
  it("keeps guests away from a manager's team: the team scope is part of every view", () => {
    const teamScope = { departmentMemberships: { some: { departmentId: { in: ['mine'] } } } };
    const filter = analyticsEmployeeFilter('org', teamScope, {}) as { AND: unknown[] };
    expect(filter.AND[0]).toBe(teamScope);
  });
  it('writes the guests line into the export under the total', () => {
    const base = { scales: [], plan: { planned: 0, completed: 0, overdue: 0 }, completionPercentage: null, averagePercentage: 80, criteria: { total: 0, answered: 0, skipped: 0, remaining: 0 }, queue: { notStarted: 0 } };
    const rows = sheetsExportRows({ total: { ...base, guests: { completed: 2, averagePercentage: 75 } }, sheets: [] }, 'ru');
    expect(rows[2]![0]).toBe('Гости (по ссылке или QR)');
    expect(rows[2]![2]).toBe(2);
    expect(rows[2]![5]).toBe(75);
    expect(sheetsExportRows({ total: { ...base, guests: { completed: 0, averagePercentage: null } }, sheets: [] }, 'ru').some((row) => row[0] === 'Гости (по ссылке или QR)')).toBe(false);
  });
});
