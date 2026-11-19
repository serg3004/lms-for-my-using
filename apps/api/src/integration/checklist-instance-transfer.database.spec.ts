/// <reference types="jest" />

import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedRequest, CurrentUser } from '../modules/auth/public.js';
import { CHECKLIST_INSTANCE_TRANSFER_NOTIFY_JOB, CHECKLIST_INSTANCE_TRANSFER_TYPE } from '../modules/checklists/checklist-instance-transfer.js';
import { ChecklistReviewAccessService } from '../modules/checklists/checklist-review-access.service.js';
import { ChecklistsController } from '../modules/checklists/checklists.controller.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 477: handing an unfinished self-filled check over to a colleague, on a real Postgres.
describe('checklist instance hand-over — database', () => {
  let prisma: PrismaService;
  let service: ChecklistsService;
  let controller: ChecklistsController;
  let organizationId: string;
  let foreignOrganizationId: string;
  let departmentId: string;
  let otherDepartmentId: string;
  let executor: CurrentUser;
  let colleague: CurrentUser;
  let second: CurrentUser;
  let outsider: CurrentUser;
  let admin: CurrentUser;
  let manager: CurrentUser;
  let foreignAdmin: CurrentUser;
  let itemId: string;
  let checklistId: string;

  async function user(org: string, roles: CurrentUser['roles'], department: string | null, extra: { status?: 'active' | 'archived' } = {}): Promise<CurrentUser> {
    const row = await prisma.user.create({ data: { organizationId: org, email: `${randomUUID()}@example.test`, firstName: 'Private', lastName: 'Person', passwordHash: 'unused', ...extra } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId: org, userId: row.id, role })) });
    if (department) await prisma.departmentMembership.create({ data: { organizationId: org, departmentId: department, userId: row.id, isPrimary: true } });
    return { ...row, roles };
  }
  const actor = (person: CurrentUser) => ({ id: person.id, organizationId: person.organizationId, roles: person.roles });
  const request = (person: CurrentUser) => ({ currentUser: person }) as unknown as AuthenticatedRequest;
  const assign = () => service.assignChecklist(checklistId, organizationId, { userId: executor.id }, admin.id);

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    service = new ChecklistsService(prisma, {} as UploadService);
    const access = new ChecklistReviewAccessService(prisma, new OrganizationAccessScopeService(prisma));
    controller = new ChecklistsController(service, {} as UploadService, access, undefined!, undefined!, undefined!);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    const run = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Transfer ${run}`, slug: `transfer-${run}` } })).id;
    foreignOrganizationId = (await prisma.organization.create({ data: { name: `Foreign ${run}`, slug: `foreign-transfer-${run}` } })).id;
    departmentId = (await prisma.department.create({ data: { organizationId, name: 'Shift A' } })).id;
    otherDepartmentId = (await prisma.department.create({ data: { organizationId, name: 'Shift B' } })).id;
    executor = await user(organizationId, ['learner'], departmentId);
    colleague = await user(organizationId, ['learner'], departmentId);
    second = await user(organizationId, ['learner'], departmentId);
    outsider = await user(organizationId, ['learner'], otherDepartmentId);
    admin = await user(organizationId, ['admin'], null);
    manager = await user(organizationId, ['manager'], null);
    foreignAdmin = await user(foreignOrganizationId, ['admin'], null);
    checklistId = (await prisma.checklist.create({ data: { organizationId, title: 'Hand-over sheet', status: 'published' } })).id;
    itemId = (await prisma.checklistItem.create({ data: { organizationId, checklistId, order: 0, text: 'A', points: 5, isRequired: true, photoRequired: true } })).id;
  });
  afterEach(async () => {
    const where = { organizationId: { in: [organizationId, foreignOrganizationId] } };
    for (const org of [organizationId, foreignOrganizationId]) await prisma.outboxEvent.deleteMany({ where: { topic: CHECKLIST_INSTANCE_TRANSFER_NOTIFY_JOB, payload: { path: ['organizationId'], equals: org } } });
    await prisma.notification.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.checklistInstanceEvent.deleteMany({ where });
    await prisma.checklistItemResult.deleteMany({ where });
    await prisma.checklistInstance.deleteMany({ where });
    await prisma.checklistItem.deleteMany({ where });
    await prisma.checklist.deleteMany({ where });
    await prisma.managerGroup.deleteMany({ where });
    await prisma.groupMember.deleteMany({ where });
    await prisma.group.deleteMany({ where });
    await prisma.departmentMembership.deleteMany({ where });
    await prisma.department.deleteMany({ where });
    await prisma.membership.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, foreignOrganizationId] } } });
  });

  it('moves the check with its answers and photo, so the colleague continues and the former executor cannot edit', async () => {
    const instance = await assign();
    await service.submitItemResult(instance.id, itemId, organizationId, executor.id, false, { checked: true });
    await prisma.checklistItemResult.updateMany({ where: { instanceId: instance.id, itemId }, data: { photoObjectKey: 'photos/proof.jpg' } });

    await service.transferInstance(instance.id, actor(executor), { toUserId: colleague.id, note: 'Finish the packing', expectedUpdatedAt: (await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id } })).updatedAt.toISOString() });

    const moved = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id }, include: { results: true } });
    expect(moved.userId).toBe(colleague.id);
    expect(moved.results).toHaveLength(1);
    expect(moved.results[0]).toMatchObject({ checked: true, photoObjectKey: 'photos/proof.jpg' });
    await expect(service.submitItemResult(instance.id, itemId, organizationId, executor.id, false, { checked: false })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.submitItemResult(instance.id, itemId, organizationId, colleague.id, false, { checked: true })).resolves.toBeDefined();

    expect(await prisma.checklistInstanceEvent.count({ where: { instanceId: instance.id, eventType: 'transferred' } })).toBe(1);
    const notices = await prisma.notification.findMany({ where: { organizationId, type: CHECKLIST_INSTANCE_TRANSFER_TYPE } });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ userId: colleague.id, data: { instanceId: instance.id }, link: `/learn/checklists?open=${instance.id}` });
    // Names, the note and the sheet title never reach the notice or the audit entry.
    expect(JSON.stringify(notices[0])).not.toMatch(/Private|Person|Finish the packing|Hand-over sheet/);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId, action: 'checklist_instance.transferred' } });
    expect(JSON.stringify(audit)).not.toMatch(/Private|Person|Finish the packing/);
    expect(await prisma.outboxEvent.count({ where: { topic: CHECKLIST_INSTANCE_TRANSFER_NOTIFY_JOB, payload: { path: ['notificationId'], equals: notices[0]!.id } } })).toBe(1);
  });

  it('shows the former executor "Handed over" and the history with names and the note, and the colleague the open check', async () => {
    const instance = await assign();
    await service.transferInstance(instance.id, actor(executor), { toUserId: colleague.id, note: 'Over to you' });
    const away = await service.listTransferredAway(executor.id, organizationId);
    expect(away).toHaveLength(1);
    expect(away[0]).toMatchObject({ id: instance.id, status: 'assigned', toUser: { id: colleague.id } });
    expect(await service.listTransferredAway(colleague.id, organizationId)).toEqual([]);
    const history = await service.listTransferHistory(instance.id, organizationId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ note: 'Over to you', from: { id: executor.id }, to: { id: colleague.id } });
    expect((await service.listMyInstances(colleague.id, organizationId)).map((row) => row.id)).toEqual([instance.id]);
    expect(await service.listMyInstances(executor.id, organizationId)).toEqual([]);
    // A relay: the colleague can hand it on again, and the history keeps both steps.
    await service.transferInstance(instance.id, actor(colleague), { toUserId: second.id });
    expect((await service.listTransferHistory(instance.id, organizationId)).map((row) => row.to?.id)).toEqual([colleague.id, second.id]);
    expect((await service.listTransferredAway(executor.id, organizationId)).map((row) => row.toUser?.id)).toEqual([second.id]);
  });

  it('offers only colleagues of the executor department and refuses everyone else', async () => {
    const instance = await assign();
    const archived = await user(organizationId, ['learner'], departmentId, { status: 'archived' });
    const foreign = await user(foreignOrganizationId, ['learner'], null);
    const names = (await service.transferInstanceCandidates(instance.id, actor(executor))).map((row) => row.id).sort();
    expect(names).toEqual([colleague.id, second.id].sort());
    for (const target of [outsider.id, archived.id, foreign.id, executor.id]) {
      await expect(service.transferInstance(instance.id, actor(executor), { toUserId: target })).rejects.toThrow();
    }
    expect((await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id } })).userId).toBe(executor.id);
    // An executor without a department has nobody to hand over to.
    const loner = await user(organizationId, ['learner'], null);
    const lonerInstance = await service.assignChecklist(checklistId, organizationId, { userId: loner.id }, admin.id);
    await expect(service.transferInstanceCandidates(lonerInstance.id, actor(loner))).resolves.toEqual([]);
  });

  it('keeps organizations apart: another organization cannot see, list or move the check', async () => {
    const instance = await assign();
    await expect(service.transferInstance(instance.id, actor(foreignAdmin), { toUserId: colleague.id })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.transferInstanceCandidates(instance.id, actor(foreignAdmin))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listTransferHistory(instance.id, foreignOrganizationId)).resolves.toEqual([]);
  });

  it('lets an administrator hand over a check of someone else, but not another learner', async () => {
    const instance = await assign();
    await expect(service.transferInstance(instance.id, actor(outsider), { toUserId: colleague.id })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.transferInstance(instance.id, actor(admin), { toUserId: colleague.id })).resolves.toBeDefined();
  });

  it('limits a manager to their team: the controller answers 404 for someone outside it and lets the team in', async () => {
    const instance = await assign();
    await expect(controller.transferInstance(instance.id, { toUserId: colleague.id }, request(manager))).rejects.toBeInstanceOf(NotFoundException);
    const group = await prisma.group.create({ data: { organizationId, name: 'Team', slug: `team-${randomUUID()}` } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: executor.id } });
    await prisma.managerGroup.create({ data: { organizationId, managerId: manager.id, groupId: group.id } });
    await expect(controller.transferInstance(instance.id, { toUserId: colleague.id }, request(manager))).resolves.toMatchObject({ userId: colleague.id });
  });

  it('refuses a finished check with 409 and keeps it with its executor', async () => {
    const instance = await assign();
    await prisma.checklistInstance.update({ where: { id: instance.id }, data: { status: 'completed', completedAt: new Date() } });
    await expect(service.transferInstance(instance.id, actor(executor), { toUserId: colleague.id })).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id } })).userId).toBe(executor.id);
    expect(await prisma.checklistInstanceEvent.count({ where: { instanceId: instance.id, eventType: 'transferred' } })).toBe(0);
  });

  it('lets exactly one of two parallel hand-overs win and answers the other with 409', async () => {
    const instance = await assign();
    const seen = (await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id } })).updatedAt.toISOString();
    const results = await Promise.allSettled([
      service.transferInstance(instance.id, actor(executor), { toUserId: colleague.id, expectedUpdatedAt: seen }),
      service.transferInstance(instance.id, actor(executor), { toUserId: second.id, expectedUpdatedAt: seen }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.checklistInstanceEvent.count({ where: { instanceId: instance.id, eventType: 'transferred' } })).toBe(1);
    expect(await prisma.notification.count({ where: { organizationId, type: CHECKLIST_INSTANCE_TRANSFER_TYPE } })).toBe(1);
  });

  it('refuses a stale version after the check changed', async () => {
    const instance = await assign();
    const seen = (await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instance.id } })).updatedAt.toISOString();
    await service.submitItemResult(instance.id, itemId, organizationId, executor.id, false, { checked: true });
    await expect(service.transferInstance(instance.id, actor(executor), { toUserId: colleague.id, expectedUpdatedAt: seen })).rejects.toBeInstanceOf(ConflictException);
  });
});
