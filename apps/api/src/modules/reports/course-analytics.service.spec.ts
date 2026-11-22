import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service.js';
import { CourseAnalyticsService } from './course-analytics.service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

function build(options: { courses?: unknown[]; users?: unknown[]; audit?: unknown[] } = {}) {
  const calls: Array<{ resource: string; args: { where?: unknown } }> = [];
  const rec = (resource: string, result: unknown) => async (args: { where?: unknown }) => { calls.push({ resource, args }); return result; };
  const labels = { ru: 'График работы', en: 'Work schedule', kk: 'Жұмыс кестесі', zh: '工作时间表' };
  const prisma = {
    userFieldDefinition: {
      findFirst: rec('userFieldDefinition', {
        id: 'field-id', key: 'work_schedule', type: 'list', labels,
        options: [{ key: '2-2', labels: { ...labels, en: 'Two on, two off', ru: 'Два через два' } }],
      }),
    },
    userFieldValue: { findMany: rec('userFieldValue', [{ userId, value: '2-2', normalizedValue: '2-2' }]) },
    course: { findMany: rec('course', options.courses ?? [{ id: courseId, title: 'Безопасность' }]) },
    assignment: { findMany: rec('assignment', [{ courseId, userId, groupId: null, departmentId: null, includeDescendants: false, dueAt: null, status: 'assigned' }]) },
    groupMember: { findMany: rec('groupMember', []) },
    departmentMembership: { findMany: rec('departmentMembership', []) },
    user: { findMany: rec('user', options.users ?? [{ id: userId, firstName: 'Анна', lastName: 'Иванова', email: 'a@x.kz' }]), findFirst: async () => (options.users?.length === 0 ? null : { id: userId, firstName: 'Анна', lastName: 'Иванова', email: 'a@x.kz' }) },
    lesson: { findMany: rec('lesson', []) },
    assessment: { findMany: rec('assessment', []) },
    progress: { findMany: rec('progress', []) },
    assessmentAttempt: { findMany: rec('assessmentAttempt', []) },
    certificate: { findMany: rec('certificate', []) },
    department: { findMany: rec('department', [{ id: 'd1', name: 'Цех' }]), findFirst: async () => ({ id: 'd1' }) },
    group: { findMany: rec('group', [{ id: 'g1', name: 'Смена А', managers: [{ manager: { id: 'm1', firstName: 'Олег', lastName: 'Петров' } }] }]) },
  } as unknown as PrismaService;
  const scope = { user: async () => ({ id: 'team-scope-marker' }) };
  const audit = options.audit ?? [];
  const service = new CourseAnalyticsService(prisma, undefined, scope as never, { record: async (entry: unknown) => { audit.push(entry); } } as never);
  return { service, calls };
}

const admin = { id: 'a', organizationId, roles: ['admin'] as const };
const manager = { id: 'm', organizationId, roles: ['manager'] as const };
const instructor = { id: 'i', organizationId, roles: ['instructor'] as const };

describe('CourseAnalyticsService scope', () => {
  it('admin reads the whole organization without team or instructor restriction', async () => {
    const { service, calls } = build();
    const result = await service.getCourses(admin, {} as never);
    expect(result.courses[0]).toMatchObject({ courseId, title: 'Безопасность', assigned: 1 });
    expect(JSON.stringify(calls.find((call) => call.resource === 'course')?.args.where)).not.toContain('instructors');
    expect(JSON.stringify(calls.find((call) => call.resource === 'user')?.args.where)).not.toContain('team-scope-marker');
  });

  it('groups the same scoped assignments and localizes the selected field in the export', async () => {
    const { service, calls } = build();
    const actor = { ...manager, locale: 'en' };
    const grouped = { includeDescendants: false, groupByField: 'work_schedule' };
    const [baseline, report] = await Promise.all([
      service.getCourses(actor, { includeDescendants: false }),
      service.getCourses(actor, grouped),
    ]);
    expect(report.fieldColumn).toBe('Work schedule');
    expect(report.courses).toEqual([{ ...baseline.courses[0], fieldLabel: 'Two on, two off', groupKey: '2-2' }]);
    expect(calls.find((call) => call.resource === 'userFieldValue')?.args.where).toMatchObject({
      organizationId, userId: { in: [userId] }, field: { visibleTo: { has: 'manager' } },
    });
    const file = await service.export(actor, { ...grouped, view: 'courses', format: 'csv' });
    expect(file.rows[0]?.at(-1)).toBe('Work schedule');
    expect(file.rows[1]?.at(-1)).toBe('Two on, two off');
  });

  it('manager reads only users of their team', async () => {
    const { service, calls } = build();
    await service.getCourses(manager, {} as never);
    expect(JSON.stringify(calls.find((call) => call.resource === 'user')?.args.where)).toContain('team-scope-marker');
  });

  it('instructor reads only courses they teach', async () => {
    const { service, calls } = build();
    await service.getCourses(instructor, {} as never);
    expect(JSON.stringify(calls.find((call) => call.resource === 'course')?.args.where)).toContain('"instructorId":"i"');
  });

  it('offers department, group and manager filters to an admin, groups and managers to a manager, none to an instructor', async () => {
    const asAdmin = await build().service.getCourses(admin, {} as never);
    expect(asAdmin.filterOptions).toEqual({ departments: [{ id: 'd1', name: 'Цех' }], groups: [{ id: 'g1', name: 'Смена А' }], managers: [{ id: 'm1', name: 'Петров Олег' }] });
    const asManager = await build().service.getCourses(manager, {} as never);
    expect(asManager.filterOptions.departments).toEqual([]);
    expect(asManager.filterOptions.groups).toHaveLength(1);
    expect((await build().service.getCourses(instructor, {} as never)).filterOptions).toEqual({ departments: [], groups: [], managers: [] });
  });

  it('counts only attempts that count toward results', async () => {
    const { service, calls } = build();
    await service.getCourses(admin, {} as never);
    expect(JSON.stringify(calls.find((call) => call.resource === 'assessmentAttempt')?.args.where)).toContain('"countsTowardResults":true');
  });

  it('does not reveal a course outside access: not found and no data query', async () => {
    const { service, calls } = build({ courses: [] });
    await expect(service.getCourseReport(instructor, courseId, {} as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(calls.some((call) => call.resource === 'assignment')).toBe(false);
  });

  it('returns a user report with their courses', async () => {
    const { service } = build();
    const report = await service.getUserReport(admin, userId, {} as never);
    expect(report.user.id).toBe(userId);
    expect(report.summary.assigned).toBe(1);
    expect(report.rows[0]?.courseTitle).toBe('Безопасность');
  });

  it('does not reveal a user outside the manager team', async () => {
    const { service } = build({ users: [] });
    await expect(service.getUserReport(manager, userId, {} as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('export (PR 475)', () => {
    it('exports the course summary in the language of the user and records it in the audit log with counts only', async () => {
      const audit: unknown[] = [];
      const { service } = build({ audit });
      const result = await service.export({ ...admin, locale: 'en', timezone: 'UTC' }, { view: 'courses', format: 'xlsx', includeDescendants: false } as never);
      expect(result.rows[0]?.[0]).toBe('Course');
      expect(result.rowCount).toBe(1);
      expect(result.filename).toMatch(/^course-analytics-courses-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.sheetName).toBe('Courses summary');
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: 'course_report.exported', actorId: 'a', metadata: { kind: 'course_analytics_courses', format: 'xlsx', rowCount: 1 } });
      expect(JSON.stringify(audit[0])).not.toContain('Безопасность');
    });

    it('uses the same scope as the screen: a manager export asks for team users only', async () => {
      const { service, calls } = build();
      await service.export({ ...manager, locale: 'ru' }, { view: 'courses', format: 'csv', includeDescendants: false } as never);
      expect(JSON.stringify(calls.find((call) => call.resource === 'user')?.args.where)).toContain('team-scope-marker');
    });

    it('does not export or record a course outside access', async () => {
      const audit: unknown[] = [];
      const { service } = build({ courses: [], audit });
      await expect(service.export(instructor, { view: 'course', courseId, format: 'xlsx', includeDescendants: false } as never)).rejects.toBeInstanceOf(NotFoundException);
      expect(audit).toHaveLength(0);
    });

    it('exports one employee with their courses', async () => {
      const { service } = build();
      const result = await service.export({ ...admin, locale: 'ru' }, { view: 'user', userId, format: 'csv', includeDescendants: false } as never);
      expect(result.rows[0]?.[0]).toBe('Курс');
      expect(result.rows[1]?.[0]).toBe('Безопасность');
    });
  });
});
