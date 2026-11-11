import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PublicCaptcha } from './checklist-public-captcha.js';
import { ChecklistPublicService, presentGuestInstance } from './checklist-public.service.js';

process.env['JWT_SECRET'] = '0123456789abcdef0123456789abcdef';

const orgId = '11111111-1111-1111-1111-111111111111';
const sheetId = '22222222-2222-2222-2222-222222222222';
const otherSheetId = '33333333-3333-3333-3333-333333333333';
const guestId = '44444444-4444-4444-4444-444444444444';
const itemId = '55555555-5555-5555-5555-555555555555';
const TOKEN = 'A'.repeat(32);
const NEW_TOKEN = 'B'.repeat(32);

type Sheet = {
  id: string; organizationId: string; title: string; description: string | null; status: string; accessMode: string;
  publicAccess: 'off' | 'registered' | 'everyone'; publicToken: string; guestNameRequired: boolean; guestPhotosAllowed: boolean; publicDailyLimit: number; deletedAt: Date | null;
};
type Instance = { id: string; organizationId: string; checklistId: string; userId: string; guestName: string | null; deletedAt: Date | null; createdAt: Date };

function setup(sheetOverrides: Partial<Sheet> = {}) {
  const sheets: Sheet[] = [
    { id: sheetId, organizationId: orgId, title: 'Лист', description: null, status: 'published', accessMode: 'free', publicAccess: 'everyone', publicToken: TOKEN, guestNameRequired: true, guestPhotosAllowed: false, publicDailyLimit: 200, deletedAt: null, ...sheetOverrides },
    { id: otherSheetId, organizationId: orgId, title: 'Чужой', description: null, status: 'published', accessMode: 'free', publicAccess: 'everyone', publicToken: 'C'.repeat(32), guestNameRequired: true, guestPhotosAllowed: false, publicDailyLimit: 200, deletedAt: null },
  ];
  const instances: Instance[] = [];
  const users: Array<{ id: string; organizationId: string; email: string }> = [];
  const tx = {
    $executeRaw: async () => 1,
    checklistInstance: {
      count: async ({ where }: { where: { checklistId: string; userId: string } }) => instances.filter((i) => i.checklistId === where.checklistId && i.userId === where.userId).length,
      update: async ({ where, data }: { where: { id: string }; data: { guestName: string | null } }) => { Object.assign(instances.find((i) => i.id === where.id)!, data); },
    },
  };
  const prisma = {
    checklist: { findFirst: async ({ where }: { where: { publicToken: string } }) => sheets.find((s) => s.publicToken === where.publicToken && !s.deletedAt) ?? null },
    checklistItem: { count: async () => 3 },
    user: {
      findFirst: async ({ where }: { where: { organizationId: string; email: string } }) => users.find((u) => u.organizationId === where.organizationId && u.email === where.email) ?? null,
      create: jest.fn(async ({ data }: { data: { organizationId: string; email: string } }) => { const user = { id: guestId, ...data }; users.push(user); return user; }),
    },
    checklistInstance: {
      findFirst: async ({ where }: { where: { id: string; checklistId: string; userId: string } }) => instances.find((i) => i.id === where.id && i.checklistId === where.checklistId && i.userId === where.userId) ?? null,
    },
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  };
  let seq = 0;
  const checklists = {
    assignChecklist: jest.fn(async (checklistId: string, organizationId: string, input: { userId: string }) => {
      const instance: Instance = { id: `aaaaaaaa-0000-0000-0000-${String(++seq).padStart(12, '0')}`, organizationId, checklistId, userId: input.userId, guestName: null, deletedAt: null, createdAt: new Date() };
      instances.push(instance);
      return { ...instance, assignedBy: input.userId, status: 'assigned', checklist: { title: 'Лист' } };
    }),
    getInstance: jest.fn(async (id: string) => ({ id, organizationId: orgId, userId: guestId, assignedBy: guestId, status: 'assigned' })),
    submitItemResult: jest.fn(async (id: string) => ({ id, organizationId: orgId, userId: guestId, status: 'in_progress' })),
    clearItemAnswer: jest.fn(async (id: string) => ({ id })),
    skipItem: jest.fn(async (id: string) => ({ id })),
    finishInstance: jest.fn(async (id: string) => ({ id, status: 'completed', organizationId: orgId, userId: guestId })),
    startFreeChecklist: jest.fn(async () => ({ id: 'free-instance' })),
    assertInstanceWritable: jest.fn(async () => undefined),
    attachItemPhoto: jest.fn(async (id: string) => ({ id })),
  };
  const upload = { uploadChecklistItemPhoto: jest.fn(async () => ({ objectKey: 'k', fileName: 'f', mimeType: 'image/png', sizeBytes: 1 })), deleteObject: jest.fn(async () => undefined) };
  const record = jest.fn(async () => undefined);
  const service = new ChecklistPublicService(prisma as never, checklists as never, upload as never, { record } as never);
  // The service's own captcha: read the code back from the picture.
  const solve = async (token = TOKEN) => {
    const { challenge, svg } = await service.newCaptcha(token);
    return { captchaChallenge: challenge, captchaCode: [...svg.matchAll(/<text [^>]*>([A-Z0-9])<\/text>/g)].map((m) => m[1]).join('') };
  };
  return { service, sheets, instances, checklists, upload, record, solve, prisma };
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
  return error as HttpException;
}

describe('ChecklistPublicService (PR 465)', () => {
  it('opens the front page only for a valid token', async () => {
    const { service } = setup();
    await expect(service.open(TOKEN)).resolves.toMatchObject({ title: 'Лист', criteriaCount: 3, guestNameRequired: true, guestPhotosAllowed: false });
    await expect(service.open('B'.repeat(32))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.open('short')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.open("'; DROP TABLE checklists; --".padEnd(32, 'x'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['switched off', { publicAccess: 'off' as const }],
    ['a draft', { status: 'draft' }],
    ['by assignment', { accessMode: 'assigned' }],
    ['deleted', { deletedAt: new Date() }],
  ])('a link of a sheet that is %s answers 404 everywhere', async (_name, overrides) => {
    const { service } = setup(overrides);
    await expect(service.open(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.newCaptcha(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.start(TOKEN, { guestName: 'Аня', captchaChallenge: 'x', captchaCode: 'y' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 401 with the return address in "registered" mode', async () => {
    const { service } = setup({ publicAccess: 'registered' });
    const error = await expectStatus(service.open(TOKEN), 401);
    expect(JSON.stringify(error.getResponse())).toContain(`/c/${TOKEN}`);
    await expectStatus(service.newCaptcha(TOKEN), 401);
    await expectStatus(service.start(TOKEN, { guestName: 'Аня', captchaChallenge: 'x', captchaCode: 'y' }), 401);
  });

  it('a signed-in user starts the ordinary pass by the link, also in "registered" mode, but only inside their organization', async () => {
    const { service, checklists } = setup({ publicAccess: 'registered' });
    await service.startAsUser(TOKEN, orgId, 'user-1');
    expect(checklists.startFreeChecklist).toHaveBeenCalledWith(sheetId, orgId, 'user-1');
    await expect(service.startAsUser(TOKEN, '99999999-9999-9999-9999-999999999999', 'user-2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a wrong or reused captcha and a missing name, and starts nothing', async () => {
    const { service, instances, solve } = setup();
    await expectStatus(service.start(TOKEN, { guestName: 'Аня', captchaChallenge: 'x.y.z', captchaCode: 'AAAAA' }), 400);
    const good = await solve();
    await expect(service.start(TOKEN, { guestName: '   ', ...good })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.start(TOKEN, { guestName: 'x'.repeat(81), ...good })).rejects.toBeInstanceOf(BadRequestException);
    expect(instances).toHaveLength(0);
    await service.start(TOKEN, { guestName: 'Аня', ...good });
    await expectStatus(service.start(TOKEN, { guestName: 'Аня', ...good }), 400);
    expect(instances).toHaveLength(1);
  });

  it('an expired captcha is told apart', async () => {
    const { service } = setup();
    const expired = new PublicCaptcha(process.env['JWT_SECRET']!, () => Date.now() - 10 * 60_000).issue();
    const code = [...expired.svg.matchAll(/<text [^>]*>([A-Z0-9])<\/text>/g)].map((m) => m[1]).join('');
    const error = await expectStatus(service.start(TOKEN, { guestName: 'Аня', captchaChallenge: expired.challenge, captchaCode: code }), 400);
    expect(JSON.stringify(error.getResponse())).toContain('CAPTCHA_EXPIRED');
  });

  it('many guests pass the same sheet at once under one service user, each with the typed name', async () => {
    const { service, instances, checklists, prisma, solve } = setup();
    const first = await service.start(TOKEN, { guestName: '  Аня  ', ...(await solve()) });
    const second = await service.start(TOKEN, { guestName: 'Борис', ...(await solve()) });
    expect(first.instanceId).not.toBe(second.instanceId);
    expect(instances.map((i) => i.guestName)).toEqual(['Аня', 'Борис']);
    expect(new Set(instances.map((i) => i.userId)).size).toBe(1);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(checklists.assignChecklist).toHaveBeenCalledWith(sheetId, orgId, { userId: guestId }, guestId, expect.anything(), { allowParallelActive: true });
    expect(JSON.stringify(first.instance)).not.toContain(guestId);
  });

  it('a guest name is optional when the sheet does not require it', async () => {
    const { service, instances, solve } = setup({ guestNameRequired: false });
    await service.start(TOKEN, { ...(await solve()) });
    expect(instances[0]?.guestName).toBeNull();
  });

  it('the daily limit answers 429 and is logged once without the token', async () => {
    const { service, record, solve } = setup({ publicDailyLimit: 2 });
    await service.start(TOKEN, { guestName: 'A', ...(await solve()) });
    await service.start(TOKEN, { guestName: 'B', ...(await solve()) });
    await expectStatus(service.start(TOKEN, { guestName: 'C', ...(await solve()) }), 429);
    await expectStatus(service.start(TOKEN, { guestName: 'D', ...(await solve()) }), 429);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist.public_access.limit_reached', targetId: sheetId }));
    expect(JSON.stringify(record.mock.calls)).not.toContain(TOKEN);
  });

  it('works a pass only with its key, only through its own sheet link', async () => {
    const { service, checklists, solve } = setup();
    const { instanceId, passKey } = await service.start(TOKEN, { guestName: 'Аня', ...(await solve()) });
    await expect(service.getPass(TOKEN, instanceId, passKey)).resolves.toBeDefined();
    await service.submitItem(TOKEN, instanceId, itemId, passKey, { checked: true } as never);
    expect(checklists.submitItemResult).toHaveBeenCalledWith(instanceId, itemId, orgId, guestId, false, { checked: true });
    await expect(service.getPass(TOKEN, instanceId, undefined)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getPass(TOKEN, instanceId, 'wrong')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getPass(TOKEN, 'not-a-uuid', passKey)).rejects.toBeInstanceOf(NotFoundException);
    // The other sheet's link with this pass and key: nothing of this pass is reachable through it.
    await expect(service.getPass('C'.repeat(32), instanceId, passKey)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a reissued link or a switched-off entry stops every pass at once', async () => {
    const { service, sheets, solve } = setup();
    const { instanceId, passKey } = await service.start(TOKEN, { guestName: 'Аня', ...(await solve()) });
    sheets[0]!.publicToken = NEW_TOKEN;
    await expect(service.getPass(TOKEN, instanceId, passKey)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getPass(NEW_TOKEN, instanceId, passKey)).rejects.toBeInstanceOf(NotFoundException);
    sheets[0]!.publicToken = TOKEN;
    sheets[0]!.publicAccess = 'off';
    await expect(service.submitItem(TOKEN, instanceId, itemId, passKey, { checked: true } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sending the result needs a fresh captcha', async () => {
    const { service, checklists, solve } = setup();
    const { instanceId, passKey } = await service.start(TOKEN, { guestName: 'Аня', ...(await solve()) });
    await expectStatus(service.finish(TOKEN, instanceId, passKey, { captchaChallenge: 'x.y.z', captchaCode: 'AAAAA' }), 400);
    expect(checklists.finishInstance).not.toHaveBeenCalled();
    await service.finish(TOKEN, instanceId, passKey, await solve());
    expect(checklists.finishInstance).toHaveBeenCalledWith(instanceId, orgId, guestId, false);
  });

  it('refuses a guest photo unless the sheet allows it', async () => {
    const closed = setup();
    const pass = await closed.service.start(TOKEN, { guestName: 'Аня', ...(await closed.solve()) });
    await expect(closed.service.attachPhoto(TOKEN, pass.instanceId, itemId, pass.passKey, { mimetype: 'image/png', buffer: Buffer.alloc(1), size: 1 } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(closed.upload.uploadChecklistItemPhoto).not.toHaveBeenCalled();

    const open = setup({ guestPhotosAllowed: true });
    const opened = await open.service.start(TOKEN, { guestName: 'Аня', ...(await open.solve()) });
    await expect(open.service.attachPhoto(TOKEN, opened.instanceId, itemId, opened.passKey, { mimetype: 'text/html', buffer: Buffer.alloc(1), size: 1 } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('shows a guest nothing about the owner or the organizer', () => {
    const shown = presentGuestInstance({ id: 'i', organizationId: orgId, userId: guestId, assignedBy: guestId, reviewerId: 'r', reviewAssignedBy: 'r', status: 'assigned', checklist: { title: 'Лист' } });
    expect(shown).toEqual({ id: 'i', status: 'assigned', percentage: null, passed: null, scored: null, checklist: { title: 'Лист' } });
  });
});
