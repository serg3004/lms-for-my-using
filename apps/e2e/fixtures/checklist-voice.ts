import { expect, type Page } from '@playwright/test';
import type { ChecklistInstanceSummary, ChecklistItemResultSummary, ChecklistSessionSummary } from '../../web/src/shared/api/types.js';

/** PR 510: a recording is replaced by fakes (the real microphone and encoder are not in a test browser). */
export const fakeRecorder = () => {
  const state = { denied: false };
  Object.assign(window, { __voice: state });
  class FakeRecorder {
    static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus';
    state = 'inactive'; mimeType = 'audio/webm;codecs=opus';
    ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; onerror: (() => void) | null = null;
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(400)], { type: 'audio/webm' }) }); this.onstop?.(); }
  }
  Object.assign(window, { MediaRecorder: FakeRecorder });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => { if (state.denied) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); return { getTracks: () => [{ stop() {} }] }; } },
  });
};

type Note = { id: string; itemId: string; place: 'answer'; durationMs: number; sizeBytes: number; createdBy: string; createdAt: string };

/** The observer's conduct screen with one required criterion whose explanation is required, and a fake voice API. */
export async function openVoiceConduct(page: Page, options: { notes?: number; failUpload?: 'offline' | 'closed' } = {}) {
  const notes: Note[] = Array.from({ length: options.notes ?? 0 }, (_, i) => ({ id: `n${i + 1}`, itemId: 'item-1', place: 'answer', durationMs: 5000, sizeBytes: 400, createdBy: 'observer', createdAt: `2026-10-01T12:0${i}:00Z` }));
  const calls: string[] = [];
  let failUpload = options.failUpload;
  const result = (itemId: string, extra: Partial<ChecklistItemResultSummary> = {}): ChecklistItemResultSummary => ({ id: `result-${itemId}`, itemId, checked: false, scaleLevel: null, points: 0, photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null, answerState: 'unanswered', ...extra });
  const instance: ChecklistInstanceSummary = {
    id: 'instance', organizationId: 'org', checklistId: 'sheet', userId: 'learner', assignedBy: 'observer', reviewerId: null, reviewAssignedAt: null, reviewAssignedBy: null,
    status: 'in_progress', totalScore: 0, maxScore: 10, percentage: 0, passed: false, dueAt: null, submittedAt: null, completedAt: null, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z',
    checklist: { id: 'sheet', organizationId: 'org', title: 'Observation sheet', description: null, status: 'published', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false, createdBy: 'observer', createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z',
      contextFields: [], itemGroups: [],
      items: [{ id: 'item-1', checklistId: 'sheet', order: 0, text: 'Greets the customer', points: 10, isRequired: true, photoRequired: false, allowSkip: false, groupId: null, noteRule: 'always', noteRequired: true }],
    },
    results: [],
  } as unknown as ChecklistInstanceSummary;
  const session = { id: 'session', organizationId: 'org', instanceId: 'instance', observerId: 'observer', status: 'in_progress', version: 1, scheduledAt: null, durationMinutes: null, startedAt: '2026-10-01T12:00:00Z', pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false, strengths: null, developmentAreas: null, nextSteps: null, observerUnavailableReason: null, observerUnavailableAt: null, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', checklist: { id: 'sheet', title: 'Observation sheet' }, learner: { id: 'learner', firstName: 'Alex', lastName: 'Learner', email: 'self@example.invalid' }, observer: { id: 'observer', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' }, result: { instanceStatus: 'in_progress', visible: true, scored: false, passed: false, percentage: null } } as unknown as ChecklistSessionSummary;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const method = route.request().method();
    if (path === '/auth/me') return route.fulfill({ json: { id: 'observer', organizationId: 'org', email: 'observer@example.invalid', firstName: 'Olga', lastName: 'Observer', roles: ['instructor'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklist-sessions/session/conduct') return route.fulfill({ json: session });
    if (path === '/checklist-instances/instance') return route.fulfill({ json: instance });
    if (path === '/checklist-instances/instance/voice-notes' && method === 'GET') return route.fulfill({ json: notes });
    if (path === '/checklist-instances/instance/items/item-1/voice-notes' && method === 'POST') {
      calls.push('upload');
      if (failUpload === 'offline') { failUpload = undefined; return route.abort('failed'); }
      if (failUpload === 'closed') return route.fulfill({ status: 400, json: { message: 'The check is finished' } });
      const created: Note = { id: `n${notes.length + 1}`, itemId: 'item-1', place: 'answer', durationMs: 2000, sizeBytes: 400, createdBy: 'observer', createdAt: '2026-10-01T12:10:00Z' };
      notes.push(created);
      return route.fulfill({ json: created });
    }
    if (/\/voice-notes\/[^/]+\/file$/.test(path)) return route.fulfill({ status: 200, contentType: 'audio/webm', body: Buffer.alloc(400) });
    if (/\/voice-notes\/[^/]+$/.test(path) && method === 'DELETE') {
      calls.push('delete');
      notes.splice(notes.findIndex((note) => note.id === path.split('/').at(-1)), 1);
      return route.fulfill({ status: 204, body: '' });
    }
    if (path.startsWith('/checklist-instances/instance/items/item-1') && method === 'PATCH') {
      calls.push('answer');
      const body = route.request().postDataJSON();
      instance.results = [{ ...result('item-1'), ...body, answerState: 'answered' }];
      return route.fulfill({ json: instance });
    }
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.goto('/instructor/checklists/sessions/session');
  await expect(page.getByText('Greets the customer').first()).toBeVisible();
  return { calls, notes, instance };
}
