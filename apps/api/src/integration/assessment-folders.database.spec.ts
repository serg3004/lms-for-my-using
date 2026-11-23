/// <reference types="jest" />

import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { AssessmentFoldersService } from '../modules/assessments/assessment-folders.service.js';
import { AssessmentsService } from '../modules/assessments/assessments.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

describe('assessment folders (PostgreSQL)', () => {
  let prisma: PrismaService;
  let folders: AssessmentFoldersService;
  let assessments: AssessmentsService;
  let organizationId: string;
  let foreignId: string;
  let actorId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    assessments = new AssessmentsService(prisma);
    folders = new AssessmentFoldersService(prisma, assessments);
    const createOrganization = (name: string) => prisma.organization.create({ data: { name, slug: randomUUID() } });
    organizationId = (await createOrganization('Assessment folders')).id;
    foreignId = (await createOrganization('Foreign assessment folders')).id;
    actorId = (await prisma.user.create({
      data: { organizationId, email: `${randomUUID()}@example.test`, firstName: 'Test', lastName: 'Author', passwordHash: 'unused' },
    })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const where = { organizationId: { in: [organizationId, foreignId].filter(Boolean) } };
      await prisma.assessment.deleteMany({ where });
      await prisma.assessmentFolder.updateMany({ where, data: { parentId: null } });
      await prisma.assessmentFolder.deleteMany({ where });
      await prisma.courseInstructor.deleteMany({ where });
      await prisma.course.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.organization.deleteMany({ where: { id: where.organizationId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('moves tests and nests folders with scoped counts, then safely unfiles a deleted subtree', async () => {
    const first = await folders.create(organizationId, actorId, { name: 'First' });
    const second = await folders.create(organizationId, actorId, { name: 'Second' });
    const child = await folders.create(organizationId, actorId, { name: 'Child', parentId: first.id });
    const course = await prisma.course.create({ data: { organizationId, title: 'Assigned course', slug: randomUUID() } });
    const test = await prisma.assessment.create({
      data: { organizationId, courseId: course.id, title: 'Course test', slug: randomUUID(), status: 'published' },
    });
    const longread = await prisma.assessment.create({
      data: { organizationId, title: 'Longread test', slug: randomUUID(), isLongreadExercise: true },
    });
    await expect(folders.bulk(organizationId, { action: 'move', kind: 'assessment', parentId: child.id, ids: [test.id, longread.id] }))
      .resolves.toMatchObject({
        done: 1, skipped: 1,
        results: [{ id: test.id, result: 'done' }, { id: longread.id, result: 'skipped', reason: 'longread_exercise' }],
      });

    await expect(folders.update(organizationId, child.id, { parentId: second.id, name: 'Renamed' }))
      .resolves.toMatchObject({ parentId: second.id, name: 'Renamed' });
    await expect(folders.update(organizationId, second.id, { parentId: child.id })).rejects.toBeInstanceOf(BadRequestException);
    await expect(folders.list(organizationId)).resolves.toMatchObject({
      rootAssessmentCount: 1,
      assessmentCount: 2,
      folders: expect.arrayContaining([
        expect.objectContaining({ id: first.id, assessmentCount: 0, totalAssessmentCount: 0 }),
        expect.objectContaining({ id: second.id, childFolderCount: 1, assessmentCount: 0, totalAssessmentCount: 1 }),
        expect.objectContaining({ id: child.id, assessmentCount: 1, totalAssessmentCount: 1 }),
      ]),
    });
    await expect(folders.list(organizationId, actorId)).resolves.toMatchObject({ assessmentCount: 0 });
    await expect(folders.deleteImpact(organizationId, second.id, actorId)).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.courseInstructor.create({ data: { organizationId, courseId: course.id, instructorId: actorId } });
    await expect(folders.list(organizationId, actorId)).resolves.toMatchObject({ assessmentCount: 1 });
    await expect(folders.update(foreignId, child.id, { name: 'Foreign rename' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(folders.bulk(foreignId, { action: 'delete', kind: 'assessment', ids: [test.id] }))
      .resolves.toMatchObject({ results: [{ id: test.id, result: 'skipped', reason: 'not_found' }] });

    const impact = { folders: 2, movedToRoot: [{ id: test.id, title: test.title }] };
    await expect(folders.deleteImpact(organizationId, second.id, actorId)).resolves.toEqual(impact);
    await expect(folders.bulk(organizationId, { action: 'delete', kind: 'folder', ids: [child.id, second.id] }))
      .resolves.toMatchObject({
        done: 1, skipped: 1,
        results: [{ id: child.id, result: 'skipped', reason: 'covered_by_parent' }, { id: second.id, result: 'done', impact }],
      });
    await expect(assessments.getAssessment(test.id, organizationId)).resolves.toMatchObject({ folderId: null, courseId: course.id, status: 'published' });
    await expect(assessments.listAssessments(organizationId)).resolves.toContainEqual(
      expect.objectContaining({ id: longread.id, folderId: null, isLongreadExercise: true }),
    );
    await expect(folders.bulk(organizationId, { action: 'delete', kind: 'assessment', ids: [test.id, randomUUID()] }))
      .resolves.toMatchObject({ done: 1, skipped: 1 });
    await expect(assessments.getAssessment(test.id, organizationId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects foreign destinations and moves that would put a descendant beyond the limit', async () => {
    const foreignUser = await prisma.user.create({
      data: { organizationId: foreignId, email: `${randomUUID()}@example.test`, firstName: 'Foreign', lastName: 'Author', passwordHash: 'unused' },
    });
    const foreign = await folders.create(foreignId, foreignUser.id, { name: 'Foreign' });
    const root = await folders.create(organizationId, actorId, { name: 'Depth root' });
    await expect(folders.update(organizationId, root.id, { parentId: foreign.id })).rejects.toBeInstanceOf(NotFoundException);
    let leaf = root;
    for (let level = 2; level <= 5; level += 1) {
      leaf = await folders.create(organizationId, actorId, { name: `Depth ${level}`, parentId: leaf.id });
    }
    const target = await folders.create(organizationId, actorId, { name: 'Destination' });
    await expect(folders.create(organizationId, actorId, { name: 'Too deep', parentId: leaf.id })).rejects.toBeInstanceOf(BadRequestException);
    await expect(folders.bulk(organizationId, { action: 'move', kind: 'folder', ids: [root.id], parentId: target.id }))
      .resolves.toMatchObject({ results: [{ id: root.id, result: 'skipped', reason: 'too_deep' }] });
  });
});
