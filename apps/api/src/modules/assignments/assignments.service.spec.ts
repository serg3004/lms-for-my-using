import { ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AssignmentsService } from './assignments.service.js';
import { createAssignmentSchema, updateAssignmentStatusSchema } from './assignments.schemas.js';

describe('Assignments validation', () => {
  it('accepts valid assignment input for user target', () => {
    const input = createAssignmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
      status: 'assigned',
      includeDescendants: false,
    });
  });

  it('accepts valid assignment input for department target with includeDescendants', () => {
    const input = createAssignmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      departmentId: '55555555-5555-5555-5555-555555555555',
      includeDescendants: true,
    });

    expect(input.departmentId).toBe('55555555-5555-5555-5555-555555555555');
    expect(input.includeDescendants).toBe(true);
  });

  it('accepts valid assignment input for group target with due date', () => {
    const input = createAssignmentSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      groupId: '44444444-4444-4444-4444-444444444444',
      dueAt: '2026-06-01T09:00:00.000Z',
    });

    expect(input.groupId).toBe('44444444-4444-4444-4444-444444444444');
    expect(input.dueAt).toEqual(new Date('2026-06-01T09:00:00.000Z'));
  });

  it('rejects assignment input without target', () => {
    expect(() =>
      createAssignmentSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
      }),
    ).toThrow();
  });

  it('rejects assignment input with both targets', () => {
    expect(() =>
      createAssignmentSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        groupId: '44444444-4444-4444-4444-444444444444',
      }),
    ).toThrow();
  });

  it('rejects assignment input with all three targets', () => {
    expect(() =>
      createAssignmentSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        groupId: '44444444-4444-4444-4444-444444444444',
        departmentId: '55555555-5555-5555-5555-555555555555',
      }),
    ).toThrow();
  });

  it('rejects includeDescendants without a departmentId target', () => {
    expect(() =>
      createAssignmentSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        includeDescendants: true,
      }),
    ).toThrow();
  });
});

describe('updateAssignmentStatusSchema', () => {
  it('accepts valid status', () => {
    expect(updateAssignmentStatusSchema.parse({ status: 'completed' })).toEqual({ status: 'completed' });
  });

  it('rejects unknown status', () => {
    expect(() => updateAssignmentStatusSchema.parse({ status: 'active' })).toThrow();
  });
});

describe('AssignmentsService createAssignment — group targeting', () => {
  const organizationId = '11111111-1111-1111-1111-111111111111';
  const courseId = '22222222-2222-2222-2222-222222222222';
  const groupId = '44444444-4444-4444-4444-444444444444';

  function buildService(groupStatus: 'active' | 'archived' | null) {
    const created = { id: 'assignment-1' };
    const prisma = {
      course: { findFirst: async () => ({ id: courseId }) },
      group: { findFirst: async () => (groupStatus ? { id: groupId, status: groupStatus } : null) },
      assignment: { create: async () => created },
    } as unknown as PrismaService;

    return new AssignmentsService(prisma);
  }

  const input = createAssignmentSchema.parse({ organizationId, courseId, groupId });

  it('rejects assigning a course to an archived group', async () => {
    const service = buildService('archived');

    await expect(service.createAssignment(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates the assignment when the group is active', async () => {
    const service = buildService('active');

    await expect(service.createAssignment(input)).resolves.toMatchObject({ id: 'assignment-1' });
  });

  it('still throws NotFoundException when the group does not exist', async () => {
    const service = buildService(null);

    await expect(service.createAssignment(input)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AssignmentsService createAssignment — department targeting', () => {
  const organizationId = '11111111-1111-1111-1111-111111111111';
  const courseId = '22222222-2222-2222-2222-222222222222';
  const departmentId = '55555555-5555-5555-5555-555555555555';

  function buildService(departmentStatus: 'active' | 'archived' | null) {
    const created = { id: 'assignment-1' };
    const prisma = {
      course: { findFirst: async () => ({ id: courseId }) },
      department: { findFirst: async () => (departmentStatus ? { id: departmentId, status: departmentStatus } : null) },
      assignment: { create: async () => created },
    } as unknown as PrismaService;

    return new AssignmentsService(prisma);
  }

  const input = createAssignmentSchema.parse({ organizationId, courseId, departmentId, includeDescendants: true });

  it('rejects assigning a course to an archived department', async () => {
    const service = buildService('archived');

    await expect(service.createAssignment(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates the assignment when the department is active', async () => {
    const service = buildService('active');

    await expect(service.createAssignment(input)).resolves.toMatchObject({ id: 'assignment-1' });
  });

  it('throws NotFoundException when the department does not exist', async () => {
    const service = buildService(null);

    await expect(service.createAssignment(input)).rejects.toBeInstanceOf(NotFoundException);
  });
});
