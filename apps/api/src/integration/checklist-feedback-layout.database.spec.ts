/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { ChecklistAnswerSetService } from '../modules/checklists/checklist-answer-set.service.js';
import { ChecklistSessionService } from '../modules/checklists/checklist-session.service.js';
import { ChecklistsService } from '../modules/checklists/checklists.service.js';
import type { FeedbackLayout } from '../modules/checklists/checklist-feedback-layout.js';
import type { UploadService } from '../modules/upload/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 405: configurable feedback section against a real Postgres -- answer-set library rules,
// layout references, the frozen snapshot, answers and the required-field gate on completion.
describe('checklist feedback layout and answer sets — database', () => {
  let prisma: PrismaService;
  let answerSets: ChecklistAnswerSetService;
  let checklists: ChecklistsService;
  let sessions: ChecklistSessionService;
  let organizationId: string;
  let otherOrganizationId: string;
  let adminId: string;
  let learnerId: string;
  let observerId: string;

  const options = [
    { id: 'yes', name: 'Yes', description: 'Fully met' },
    { id: 'no', name: 'No', description: null },
  ];
  const layoutFor = (answerSetId: string, required = true): FeedbackLayout => ({
    fields: [{ id: 'note', kind: 'text', title: 'Note', required: false }],
    sections: [{ id: 'sec', title: 'Verdict', fields: [{ id: 'verdict', kind: 'choice', title: 'Verdict', required, answerSetId, multiple: false }], sections: [] }],
  });

  async function makeUser(org: string, label: string) {
    return prisma.user.create({ data: { organizationId: org, email: `${label}-${randomUUID()}@example.test`, passwordHash: 'unused', firstName: label, lastName: 'User' } });
  }
  async function assign(feedbackLayout: FeedbackLayout | null) {
    const checklist = await checklists.createChecklist({
      organizationId, title: 'Sheet', scoringMode: 'sum_points', passThreshold: 80, requiresReview: false, preSessionVisibility: 'structure_only',
      allowFinishIncomplete: true, forbidGalleryPhotos: false, feedbackEnabled: true, feedbackRequired: false, allowSkipAll: false, accessMode: 'assigned',
      allowEditByAll: false, feedbackLayout,
    }, adminId);
    await prisma.checklistItem.create({ data: { organizationId, checklistId: checklist.id, order: 0, text: 'Item', points: 1, isRequired: false, photoRequired: false } });
    await checklists.updateChecklist(checklist.id, organizationId, { status: 'published' }, adminId);
    const instance = await checklists.assignChecklist(checklist.id, organizationId, { userId: learnerId }, adminId);
    const session = await sessions.create(organizationId, { instanceId: instance.id, observerId }, adminId);
    const started = await sessions.transition(session.id, organizationId, 'start', 1, observerId, {});
    return { checklistId: checklist.id, instanceId: instance.id, sessionId: session.id, version: started.version };
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    answerSets = new ChecklistAnswerSetService(prisma);
    checklists = new ChecklistsService(prisma, {} as UploadService);
    sessions = new ChecklistSessionService(prisma, checklists);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    const run = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Feedback layout ${run}`, slug: `feedback-layout-${run}` } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: `Feedback layout other ${run}`, slug: `feedback-layout-other-${run}` } })).id;
    adminId = (await makeUser(organizationId, 'admin')).id;
    learnerId = (await makeUser(organizationId, 'learner')).id;
    observerId = (await makeUser(organizationId, 'observer')).id;
    await prisma.membership.create({ data: { organizationId, userId: observerId, role: 'instructor' } });
  });
  afterEach(async () => {
    for (const id of [organizationId, otherOrganizationId]) {
      const where = { organizationId: id };
      await prisma.checklistSessionEvent.deleteMany({ where });
      await prisma.checklistSession.deleteMany({ where });
      await prisma.checklistItemResult.deleteMany({ where });
      await prisma.checklistInstance.deleteMany({ where });
      await prisma.checklistItem.deleteMany({ where });
      await prisma.checklist.deleteMany({ where });
      await prisma.checklistAnswerSet.deleteMany({ where });
      await prisma.membership.deleteMany({ where });
      await prisma.auditLog.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.organization.deleteMany({ where: { id } });
    }
  });

  it('manages the answer-set library: create, edit, copy, archive, usage and guarded delete', async () => {
    const created = await answerSets.create(organizationId, { name: 'Verdict', options }, adminId);
    expect(created).toMatchObject({ name: 'Verdict', status: 'active', inUse: false, usageCount: 0 });
    expect(created.options).toEqual(options);

    const edited = await answerSets.update(created.id, organizationId, { name: 'Verdict v2', options: [...options, { id: 'part', name: 'Partly' }] }, adminId);
    expect(edited.options).toHaveLength(3);

    const copy = await answerSets.copy(created.id, organizationId, undefined, adminId);
    expect(copy.name).toBe('Verdict v2 (copy)');
    expect(copy.id).not.toBe(created.id);

    const checklist = await checklists.createChecklist({
      organizationId, title: 'Uses set', scoringMode: 'sum_points', passThreshold: 80, requiresReview: false, preSessionVisibility: 'structure_only',
      allowFinishIncomplete: false, forbidGalleryPhotos: false, feedbackEnabled: true, feedbackRequired: false, allowSkipAll: false, accessMode: 'assigned',
      allowEditByAll: false, feedbackLayout: layoutFor(created.id),
    }, adminId);
    const used = await answerSets.get(created.id, organizationId, true);
    expect(used).toMatchObject({ inUse: true, usageCount: 1, usedByChecklists: [{ id: checklist.id, title: 'Uses set' }] });
    expect((await answerSets.get(created.id, organizationId, false)).usedByChecklists).toEqual([]);

    await expect(answerSets.remove(created.id, organizationId, adminId)).rejects.toThrow('archive it instead');
    const archived = await answerSets.archive(created.id, organizationId, adminId);
    expect(archived.status).toBe('archived');
    await expect(answerSets.update(created.id, organizationId, { name: 'x' }, adminId)).rejects.toThrow('archived');
    await answerSets.remove(copy.id, organizationId, adminId);
    await expect(answerSets.get(copy.id, organizationId)).rejects.toThrow('not found');
    expect((await answerSets.list(organizationId)).map((set) => set.id)).toEqual([created.id]);
  });

  it('does not let a sheet reference an unknown, foreign or newly archived answer set', async () => {
    const own = await answerSets.create(organizationId, { name: 'Own', options }, adminId);
    const foreign = await answerSets.create(otherOrganizationId, { name: 'Foreign', options }, adminId);
    const base = {
      organizationId, title: 'Sheet', scoringMode: 'sum_points' as const, passThreshold: 80, requiresReview: false, preSessionVisibility: 'structure_only' as const,
      allowFinishIncomplete: false, forbidGalleryPhotos: false, feedbackEnabled: true, feedbackRequired: false, allowSkipAll: false, accessMode: 'assigned' as const, allowEditByAll: false,
    };
    await expect(checklists.createChecklist({ ...base, feedbackLayout: layoutFor(foreign.id) }, adminId)).rejects.toThrow('Unknown answer set');
    await expect(checklists.createChecklist({ ...base, feedbackLayout: layoutFor(randomUUID()) }, adminId)).rejects.toThrow('Unknown answer set');

    const sheet = await checklists.createChecklist({ ...base, feedbackLayout: layoutFor(own.id) }, adminId);
    await answerSets.archive(own.id, organizationId, adminId);
    // The sheet that already used it may keep it; a new sheet may not pick it.
    await expect(checklists.updateChecklist(sheet.id, organizationId, { feedbackLayout: layoutFor(own.id, false) }, adminId)).resolves.toBeDefined();
    await expect(checklists.createChecklist({ ...base, feedbackLayout: layoutFor(own.id) }, adminId)).rejects.toThrow('archived');

    // Back to the classic fields.
    await checklists.updateChecklist(sheet.id, organizationId, { feedbackLayout: null }, adminId);
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id: sheet.id } })).feedbackLayout).toBeNull();
  });

  it('freezes the layout and options in the snapshot; later edits reach only a session that has not started', async () => {
    const set = await answerSets.create(organizationId, { name: 'Verdict', options }, adminId);
    const { checklistId, instanceId } = await assign(layoutFor(set.id));

    const stored = (await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } })).templateSnapshot as { checklist: { feedbackLayout: FeedbackLayout; feedbackAnswerSets: Record<string, { options: unknown[] }> } };
    expect(stored.checklist.feedbackLayout.sections[0]?.fields[0]?.id).toBe('verdict');
    expect(stored.checklist.feedbackAnswerSets[set.id]?.options).toHaveLength(2);

    await answerSets.update(set.id, organizationId, { options: [{ id: 'only', name: 'Only' }] }, adminId);
    await checklists.updateChecklist(checklistId, organizationId, { feedbackLayout: null }, adminId);
    const after = (await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } })).templateSnapshot as typeof stored;
    expect(after.checklist.feedbackLayout.sections).toHaveLength(1);
    expect(after.checklist.feedbackAnswerSets[set.id]?.options).toHaveLength(2);

    // A started session (the instance has no answers yet, but refresh runs on session start for fresh ones).
    await checklists.refreshScaleSnapshot(instanceId, organizationId);
    const refreshed = (await prisma.checklistInstance.findUniqueOrThrow({ where: { id: instanceId } })).templateSnapshot as typeof stored;
    expect(refreshed.checklist.feedbackAnswerSets[set.id]?.options).toEqual([{ id: 'only', name: 'Only', description: null }]);
    expect(refreshed.checklist.feedbackLayout.sections).toHaveLength(1);
  });

  it('records answers against the frozen layout, mirrors built-in fields and gates completion on required fields', async () => {
    const set = await answerSets.create(organizationId, { name: 'Verdict', options }, adminId);
    const { sessionId, version } = await assign(layoutFor(set.id));

    await expect(sessions.submitFeedback(sessionId, organizationId, { answers: { ghost: 'x' }, version }, observerId, {})).rejects.toThrow('Unknown feedback field');
    await expect(sessions.submitFeedback(sessionId, organizationId, { answers: { verdict: ['zzz'] }, version }, observerId, {})).rejects.toThrow('Unknown answer option');
    await expect(sessions.submitFeedback(sessionId, organizationId, { strengths: 'old key', version }, observerId, {})).rejects.toThrow('Unknown feedback field');

    const saved = await sessions.submitFeedback(sessionId, organizationId, { answers: { note: ' Good ', verdict: ['yes'] }, version }, observerId, {});
    expect(saved.feedbackAnswers).toEqual({ note: 'Good', verdict: ['yes'] });
    expect(saved.strengths).toBeNull();

    const cleared = await sessions.submitFeedback(sessionId, organizationId, { answers: { verdict: null }, version: saved.version }, observerId, {});
    expect(cleared.feedbackAnswers).toEqual({ note: 'Good' });
    await expect(sessions.transition(sessionId, organizationId, 'complete', cleared.version, observerId, {})).rejects.toThrow('fill in "Verdict"');

    const filled = await sessions.submitFeedback(sessionId, organizationId, { answers: { verdict: ['no'] }, version: cleared.version }, observerId, {});
    const completed = await sessions.transition(sessionId, organizationId, 'complete', filled.version, observerId, {});
    expect(completed.status).toBe('completed');
  });

  it('keeps the classic three fields for a sheet without a layout, dual-written to the old columns', async () => {
    const { sessionId, version } = await assign(null);
    const saved = await sessions.submitFeedback(sessionId, organizationId, { strengths: 'Strong', answers: { developmentAreas: 'Pace' }, version }, observerId, {});
    expect(saved).toMatchObject({ strengths: 'Strong', developmentAreas: 'Pace', nextSteps: null, feedbackAnswers: { strengths: 'Strong', developmentAreas: 'Pace' } });
    await expect(sessions.submitFeedback(sessionId, organizationId, { answers: { verdict: ['yes'] }, version: saved.version }, observerId, {})).rejects.toThrow('Unknown feedback field');
  });
});
