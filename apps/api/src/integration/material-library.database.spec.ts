/// <reference types="jest" />

import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { CourseMaterialsService } from '../modules/course-materials/course-materials.service.js';
import { LibraryFoldersService, type LibraryActor } from '../modules/library-folders/library-folders.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

describe('material library (PostgreSQL, PR 582)', () => {
  let prisma: PrismaService;
  let materials: CourseMaterialsService;
  let folders: LibraryFoldersService;
  let organizationId: string;
  let admin: LibraryActor;
  let courseA: string;
  let courseB: string;
  let lessonA: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    materials = new CourseMaterialsService(prisma);
    folders = new LibraryFoldersService(prisma);
    organizationId = (await prisma.organization.create({ data: { name: 'Material library', slug: randomUUID() } })).id;
    const userId = (await prisma.user.create({
      data: { organizationId, email: `${randomUUID()}@example.test`, firstName: 'Test', lastName: 'Admin', passwordHash: 'unused' },
    })).id;
    admin = { organizationId, id: userId, roles: ['admin'] };
    courseA = (await prisma.course.create({ data: { organizationId, title: 'Course A', slug: randomUUID() } })).id;
    courseB = (await prisma.course.create({ data: { organizationId, title: 'Course B', slug: randomUUID() } })).id;
    lessonA = (await prisma.lesson.create({ data: { organizationId, courseId: courseA, title: 'Lesson A', slug: randomUUID(), order: 1 } })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const where = { organizationId };
      await prisma.courseMaterialLink.deleteMany({ where });
      await prisma.courseMaterial.deleteMany({ where });
      await prisma.lesson.deleteMany({ where });
      await prisma.course.deleteMany({ where });
      await prisma.libraryFolder.updateMany({ where, data: { parentId: null } });
      await prisma.libraryFolder.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('creates a material without a course in a folder, connects it to two courses and a lesson, and reports its usage', async () => {
    const folder = await folders.create(admin, { scope: 'material', name: 'Policies' });
    const material = await materials.createLibraryMaterial(organizationId, ['admin'], { title: 'Fire policy', kind: 'link', fileUrl: 'https://example.test/policy', status: 'active', folderId: folder.id });
    expect(material).toMatchObject({ courseId: null, folderId: folder.id });
    await expect(materials.createLibraryMaterial(organizationId, ['instructor'], { title: 'Nope', kind: 'link', status: 'active' })).rejects.toBeInstanceOf(ForbiddenException);

    await materials.connectMaterial(courseA, organizationId, admin, material.id, lessonA);
    await materials.connectMaterial(courseB, organizationId, admin, material.id, null);
    const inA = await materials.listCourseMaterials(courseA, organizationId);
    expect(inA).toEqual([expect.objectContaining({ id: material.id, lessonId: lessonA, connected: true })]);
    expect(await materials.listCourseMaterials(courseB, organizationId)).toHaveLength(1);

    const usage = await materials.materialUsage(material.id, organizationId);
    expect(usage.places.map((place) => place.courseTitle).sort()).toEqual(['Course A', 'Course B']);
    expect(await folders.deleteImpact(admin, folder.id)).toMatchObject({ movedToRoot: [{ id: material.id, title: 'Fire policy' }] });

    await materials.disconnectMaterial(courseB, organizationId, material.id);
    expect(await materials.listCourseMaterials(courseB, organizationId)).toHaveLength(0);
    expect(await prisma.courseMaterial.findUnique({ where: { id: material.id } })).not.toBeNull();
  });

  it('keeps a material created inside a course as it was and does not connect it back to its own course', async () => {
    const own = await materials.createCourseMaterial({ organizationId, courseId: courseA, title: 'Own', slug: 'own-material', kind: 'link', status: 'active' });
    expect(await materials.listCourseMaterials(courseA, organizationId)).toEqual(expect.arrayContaining([expect.objectContaining({ id: own.id, connected: false })]));
    await expect(materials.connectMaterial(courseA, organizationId, admin, own.id, null)).rejects.toBeInstanceOf(ConflictException);
    // An instructor connects only library materials.
    await expect(materials.connectMaterial(courseB, organizationId, { id: admin.id, roles: ['instructor'] }, own.id, null)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('moves materials between folders through the shared folder service, and a deleted material loses its connections', async () => {
    const folder = await folders.create(admin, { scope: 'material', name: 'Moved' });
    const material = await materials.createLibraryMaterial(organizationId, ['admin'], { title: 'Handbook', kind: 'link', status: 'active' });
    await expect(folders.bulk(admin, { action: 'move', scope: 'material', kind: 'item', ids: [material.id], parentId: folder.id })).resolves.toMatchObject({ done: 1 });
    expect(await materials.listLibrary(organizationId, folder.id)).toHaveLength(1);
    expect(await materials.listLibrary(organizationId, null)).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: material.id })]));

    await materials.connectMaterial(courseB, organizationId, admin, material.id, null);
    await materials.deleteCourseMaterial(material.id, organizationId);
    expect(await prisma.courseMaterialLink.count({ where: { materialId: material.id } })).toBe(0);
    expect(await materials.listCourseMaterials(courseB, organizationId)).toHaveLength(0);
  });
});
