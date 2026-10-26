import { jest } from '@jest/globals';
import type { PrismaService } from '../../database/prisma.service.js';
import { sessionChangeText } from './checklist-session-notification-text.js';
import { CHECKLIST_SESSION_CHANGE_TYPES } from './checklist-session-notifications.js';

const configured = jest.fn(() => false);
const sendMail = jest.fn<(input: { to: string; subject: string; text: string }) => Promise<void>>(async () => undefined);
jest.unstable_mockModule('../../common/mail/mailer.js', () => ({ isMailConfigured: configured, sendMail }));
const { ChecklistSessionReminderDelivery } = await import('./checklist-session-reminder-delivery.js');
const env = process.env;
function harness() {
  const prisma = {
    notification: { findFirst: jest.fn(async () => ({ type: 'checklist_session_completed', userId: 'learner', data: { sessionId: 'session' }, link: '/learn/checklists?sessionId=session' })) },
    checklistSession: { findFirst: jest.fn(async () => ({ id: 'session' })) },
    user: { findFirst: jest.fn(async () => ({ locale: 'en', email: 'learner@example.invalid' })) },
  };
  return { prisma, delivery: new ChecklistSessionReminderDelivery(prisma as unknown as PrismaService) };
}
beforeEach(() => {
  process.env = { ...env, FRONTEND_URL: 'https://lms.example.invalid' };
  delete process.env['CHECKLIST_SESSION_REMINDER_DELIVERY_URL'];
  configured.mockReturnValue(false); sendMail.mockClear();
});
afterEach(() => { process.env = env; jest.restoreAllMocks(); });
describe('session change delivery', () => {
  it('is a no-op without mail, leaving the portal notice intact', async () => {
    const { delivery, prisma } = harness();
    await delivery.sendChange({ organizationId: 'org', notificationId: 'notice' });
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('uses scoped durable data and localized generic copy, never job-supplied content', async () => {
    configured.mockReturnValue(true);
    const { delivery, prisma } = harness();
    await delivery.sendChange({ organizationId: 'org', notificationId: 'notice' });
    expect(prisma.notification.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'notice', organizationId: 'org' }) }));
    expect(prisma.checklistSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'session', organizationId: 'org', deletedAt: null }) }));
    expect(sendMail).toHaveBeenCalledWith({ to: 'learner@example.invalid', subject: 'Training session completed', text: 'The session is complete. Open it to view the feedback available to you.\nhttps://lms.example.invalid/learn/checklists?sessionId=session' });
  });
  it('suppresses stale changes/reminders/messages for a deleted session', async () => {
    configured.mockReturnValue(true);
    const { delivery, prisma } = harness();
    prisma.checklistSession.findFirst.mockResolvedValue(null as never);
    await delivery.sendChange({ organizationId: 'org', notificationId: 'notice' });
    await delivery.send({ organizationId: 'org', sessionId: 'session', observerId: 'observer', reminderType: 'pre_start' });
    await delivery.sendMessage({ organizationId: 'org', sessionId: 'session', recipientId: 'learner', checklistTitle: 'Private title', message: 'Private text' });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('permits the deletion notice itself, with a list link instead of an inaccessible session', async () => {
    configured.mockReturnValue(true);
    const { delivery, prisma } = harness();
    prisma.notification.findFirst.mockResolvedValue({ type: 'checklist_session_deleted', userId: 'learner', data: { sessionId: 'session' }, link: '/learn/checklists' });
    await delivery.sendChange({ organizationId: 'org', notificationId: 'notice' });
    expect(prisma.checklistSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: { not: null } }) }));
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it('ignores foreign/inactive recipients and forged notification links', async () => {
    configured.mockReturnValue(true);
    const { delivery, prisma } = harness();
    prisma.user.findFirst.mockResolvedValueOnce(null as never);
    await delivery.sendChange({ organizationId: 'org', notificationId: 'notice' });
    prisma.notification.findFirst.mockResolvedValue({ type: 'checklist_session_completed', userId: 'learner', data: { sessionId: 'session' }, link: 'https://outside.example.invalid' });
    await delivery.sendChange({ organizationId: 'org', notificationId: 'notice' });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('propagates a provider failure for the existing queue retry mechanism', async () => {
    configured.mockReturnValue(true);
    sendMail.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(harness().delivery.sendChange({ organizationId: 'org', notificationId: 'notice' })).rejects.toThrow('provider unavailable');
  });
  it('preserves the optional delivery hook with minimal recipient-scoped payload', async () => {
    process.env['CHECKLIST_SESSION_REMINDER_DELIVERY_URL'] = 'https://hook.example.invalid';
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    await harness().delivery.sendChange({ organizationId: 'org', notificationId: 'notice' });
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ kind: 'session_change', organizationId: 'org', sessionId: 'session', recipientId: 'learner', type: 'checklist_session_completed', link: '/learn/checklists?sessionId=session', locale: 'en' });
  });
  it.each(['ru', 'en', 'kk', 'zh'])('has non-empty generic email copy in %s', (locale) => {
    for (const type of CHECKLIST_SESSION_CHANGE_TYPES) {
      const text = sessionChangeText(type, locale);
      expect(text.title.length).toBeGreaterThan(0); expect(text.message.length).toBeGreaterThan(0);
      expect(JSON.stringify(text)).not.toMatch(/@|latitude|longitude|percentage/);
    }
  });
});
