/// <reference types="jest" />

import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { assertLibraryFolder } from '../common/library-folder-check.js';
import { PrismaService } from '../database/prisma.service.js';
import { LibraryFoldersService, type LibraryActor } from '../modules/library-folders/library-folders.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

describe('library folders of courses and assignments (PostgreSQL, PR 581)', () => {
  let prisma: PrismaService;
  let folders: LibraryFoldersService;
  let organizationId: string;
  let foreignId: string;
  let admin: LibraryActor;
  let manager: LibraryActor;
  let userId: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    folders = new LibraryFoldersService(prisma);
    const createOrganization = (name: string) => prisma.organization.create({ data: { name, slug: randomUUID() } });
    organizationId = (await createOrganization('Library folders')).id;
    foreignId = (await createOrganization('Foreign library folders')).id;
    userId = (await prisma.user.create({
      data: { organizationId, email: `${randomUUID()}@example.test`, firstName: 'Test', lastName: 'Admin', passwordHash: 'unused' },
    })).id;
    admin = { organizationId, id: userId, roles: ['admin'] };
    manager = { organizationId, id: userId, roles: ['manager'] };
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const where = { organizationId: { in: [organizationId, foreignId].filter(Boolean) } };
      await prisma.assignment.deleteMany({ where });
      await prisma.course.deleteMany({ where });
      await prisma.libraryFolder.updateMany({ where, data: { parentId: null } });
      await prisma.libraryFolder.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.organization.deleteMany({ where: { id: where.organizationId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('nests folders per section, counts items, moves them and unfiles a deleted subtree', async () => {
    const parent = await folders.create(admin, { scope: 'course', name: 'Safety' });
    const child = await folders.create(admin, { scope: 'course', name: 'Fire', parentId: parent.id, color: 'green' });
    expect(child.color).toBe('green');
    // The same name in another section is a different folder.
    await expect(folders.create(admin, { scope: 'assignment', name: 'Safety' })).resolves.toMatchObject({ scope: 'assignment' });
    await expect(folders.create(admin, { scope: 'course', name: ' safety ' })).rejects.toMatchObject({ status: 409 });

    const course = await prisma.course.create({ data: { organizationId, title: 'Fire basics', slug: randomUUID() } });
    await expect(folders.bulk(admin, { action: 'move', scope: 'course', kind: 'item', ids: [course.id], parentId: child.id }))
      .resolves.toMatchObject({ done: 1, skipped: 0 });
    await expect(folders.bulk(admin, { action: 'move', scope: 'course', kind: 'item', ids: [course.id], parentId: child.id }))
      .resolves.toMatchObject({ done: 0, results: [{ result: 'skipped', reason: 'already_in_folder' }] });

    const listed = await folders.list(admin, 'course');
    expect(listed.folders.find((row) => row.id === parent.id)).toMatchObject({ childFolderCount: 1, itemCount: 0, totalItemCount: 1 });
    expect(listed).toMatchObject({ itemCount: 1, rootItemCount: 0 });
    await expect(folders.deleteImpact(admin, parent.id)).resolves.toMatchObject({ folders: 2, movedToRoot: [{ id: course.id, title: 'Fire basics' }] });

    await expect(folders.bulk(admin, { action: 'move', scope: 'course', kind: 'folder', ids: [parent.id], parentId: child.id }))
      .resolves.toMatchObject({ results: [{ result: 'skipped', reason: 'cycle' }] });
    await folders.remove(admin, parent.id);
    await expect(prisma.course.findUniqueOrThrow({ where: { id: course.id } })).resolves.toMatchObject({ folderId: null });
    await expect(folders.list(admin, 'course')).resolves.toMatchObject({ folders: [], rootItemCount: 1 });
  });

  it('keeps assignments in their own tree and titles them by course', async () => {
    const folder = await folders.create(manager, { scope: 'assignment', name: 'Spring' });
    const course = await prisma.course.create({ data: { organizationId, title: 'Onboarding', slug: randomUUID() } });
    const assignment = await prisma.assignment.create({ data: { organizationId, courseId: course.id, userId } });
    await folders.bulk(manager, { action: 'move', scope: 'assignment', kind: 'item', ids: [assignment.id], parentId: folder.id });
    await expect(folders.deleteImpact(manager, folder.id)).resolves.toMatchObject({ movedToRoot: [{ id: assignment.id, title: 'Onboarding' }] });
    // A course id is not an assignment: the item is not found in this section.
    await expect(folders.bulk(manager, { action: 'move', scope: 'assignment', kind: 'item', ids: [course.id], parentId: null }))
      .resolves.toMatchObject({ results: [{ result: 'skipped', reason: 'not_found' }] });
    // A folder of another section cannot receive the item.
    const courseFolder = await folders.create(admin, { scope: 'course', name: 'Other section' });
    await expect(folders.bulk(manager, { action: 'move', scope: 'assignment', kind: 'item', ids: [assignment.id], parentId: courseFolder.id }))
      .resolves.toMatchObject({ results: [{ result: 'skipped', reason: 'not_found' }] });
  });

  it('refuses people of other roles and hides folders of other organizations', async () => {
    await expect(folders.list(manager, 'course')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(folders.create({ ...admin, roles: ['instructor'] }, { scope: 'assignment', name: 'No' })).rejects.toBeInstanceOf(ForbiddenException);
    const folder = await folders.create(admin, { scope: 'assignment', name: 'Mine' });
    await expect(folders.update({ ...admin, organizationId: foreignId }, folder.id, { name: 'Taken' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(folders.update(manager, (await folders.create(admin, { scope: 'course', name: 'Courses only' })).id, { name: 'Taken' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a seventh level', async () => {
    let parentId: string | undefined;
    for (let level = 1; level <= 5; level += 1) parentId = (await folders.create(admin, { scope: 'assignment', name: `Level ${level}`, parentId: parentId ?? null })).id;
    await expect(folders.create(admin, { scope: 'assignment', name: 'Level 6', parentId })).rejects.toMatchObject({ status: 400 });
  });

  it('lets an item be created only in a live folder of its own section and organization', async () => {
    const courseFolder = await folders.create(admin, { scope: 'course', name: 'For new courses' });
    const assignmentFolder = await folders.create(admin, { scope: 'assignment', name: 'For new assignments' });
    await expect(assertLibraryFolder(prisma, organizationId, 'course', courseFolder.id)).resolves.toBeUndefined();
    await expect(assertLibraryFolder(prisma, organizationId, 'course', null)).resolves.toBeUndefined();
    await expect(assertLibraryFolder(prisma, organizationId, 'course', assignmentFolder.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertLibraryFolder(prisma, foreignId, 'course', courseFolder.id)).rejects.toBeInstanceOf(NotFoundException);
    await folders.remove(admin, courseFolder.id);
    await expect(assertLibraryFolder(prisma, organizationId, 'course', courseFolder.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
