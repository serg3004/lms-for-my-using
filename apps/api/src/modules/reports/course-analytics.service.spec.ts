import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service.js';
import { CourseAnalyticsService } from './course-analytics.service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

function build(options: { courses?: unknown[]; users?: unknown[] } = {}) {
  const calls: Array<{ resource: string; args: { where?: unknown } }> = [];
  const rec = (resource: string, result: unknown) => async (args: { where?: unknown }) => { calls.push({ resource, args }); return result; };
  const prisma = {
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
  const service = new CourseAnalyticsService(prisma, undefined, scope as never);
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
});
