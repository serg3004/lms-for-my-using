import type { Page } from '@playwright/test';

// PR 478: mocks of the filled-in sheet as a report, and of answering a criterion on a long sheet (the page must not reload).
const person = { id: 'lena', firstName: 'Лена', lastName: 'Лернер', email: 'lena@example.invalid', department: { id: 'd1', name: 'Смена А' } };
const items = Array.from({ length: 30 }, (_, index) => ({
  id: `i${index + 1}`, checklistId: 'c1', order: index + 1, text: `Критерий ${index + 1}`, points: 10, isRequired: true, photoRequired: false, weight: 1,
  allowSkip: false, autoSkipUnanswered: false, scaleId: null, groupId: null, scale: null,
}));
const sheet = { id: 'c1', title: 'Приёмка товара', description: null, showPointsToLearner: false, scoringMode: 'sum_points', scaleLevels: null, requiresReview: false, passThreshold: 70, forbidGalleryPhotos: false, allowFinishIncomplete: false, contextFields: [], itemGroups: [], items };

export type ReportState = { status: 'in_progress' | 'completed'; answered: string[]; submits: number; instanceReads: number; pdfDownloads: number };
export const freshReportState = (status: ReportState['status'] = 'in_progress'): ReportState => ({ status, answered: ['i1'], submits: 0, instanceReads: 0, pdfDownloads: 0 });

const resultOf = (itemId: string) => ({ itemId, instanceId: 'inst1', checked: true, scaleLevel: null, points: 10, comment: itemId === 'i1' ? 'Пломба цела' : null, photoObjectKey: null, photoFileName: null, reviewStatus: null, answerState: 'answered' });
const instance = (state: ReportState) => ({
  id: 'inst1', organizationId: 'org', checklistId: 'c1', userId: 'lena', assignedBy: null, reviewerId: null, status: state.status, totalScore: state.answered.length * 10, maxScore: 300, percentage: 0, passed: false, scored: true,
  dueAt: null, createdAt: '2026-11-19T08:00:00.000Z', updatedAt: '2026-11-19T09:00:00.000Z', checklist: sheet, results: state.answered.map(resultOf),
});

function report(state: ReportState) {
  const finished = state.status === 'completed';
  return {
    pointsVisible: true, sessionId: null, instanceId: 'inst1', checklist: { id: 'c1', title: 'Приёмка товара', showNumbering: true }, visible: true,
    header: { status: state.status, timezone: 'Asia/Almaty', scheduledStart: null, scheduledEnd: null, startedAt: '2026-11-19T04:00:00.000Z', completedAt: finished ? '2026-11-19T05:00:00.000Z' : null, learner: person, observer: null },
    generalInfo: [],
    summary: finished ? { scored: true, scoringMode: 'sum_points', percentage: 10, totalScore: 30, maxScore: 300, criteriaCount: 30, answeredCount: 3, skippedCount: 0, passed: false, passThreshold: 70, formula: 'snapshot', color: null } : null,
    groups: [],
    criteria: state.answered.map((id, index) => ({ id, number: String(index + 1), groupId: null, text: `Критерий ${id.slice(1)}`, state: 'answered', score: finished ? 10 : null, maxScore: finished ? 10 : null, levelLabel: 'Да', comment: id === 'i1' ? 'Пломба цела' : null, photo: null, reviewStatus: null, color: null })),
    feedback: null, feedbackForm: null, location: { policy: 'off', captures: [] },
    transfers: [{ id: 'e1', at: '2026-11-19T06:00:00.000Z', note: 'Склад закрывается в 18:00', from: 'Борис Петров', to: 'Лена Лернер' }],
  };
}

export async function installReportMocks(page: Page, state: ReportState) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const method = route.request().method();
    if (path === '/auth/me') return route.fulfill({ json: { id: 'lena', organizationId: 'org', email: 'lena@example.invalid', firstName: 'Лена', lastName: 'Лернер', roles: ['learner'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists/free') return route.fulfill({ json: [] });
    if (path === '/checklist-instances/mine') { state.instanceReads += 1; return route.fulfill({ json: [instance(state)] }); }
    if (path === '/checklist-instances/transferred-from-me') return route.fulfill({ json: [] });
    if (path === '/checklist-instances/inst1/transfers') return route.fulfill({ json: [{ id: 'e1', at: '2026-11-19T06:00:00.000Z', note: 'Склад закрывается в 18:00', from: { id: 'boris', firstName: 'Борис', lastName: 'Петров' }, to: { id: 'lena', firstName: 'Лена', lastName: 'Лернер' } }] });
    if (path === '/checklist-instances/inst1/report') return route.fulfill({ json: report(state) });
    if (path === '/checklist-instances/inst1/report.pdf') {
      state.pdfDownloads += 1;
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="checklist-inst1.pdf"' }, body: Buffer.from('%PDF-1.4\n%%EOF') });
    }
    const patch = path.match(/^\/checklist-instances\/inst1\/items\/(i\d+)$/);
    if (patch && method === 'PATCH') {
      state.submits += 1;
      if (!state.answered.includes(patch[1]!)) state.answered.push(patch[1]!);
      return route.fulfill({ json: instance(state) });
    }
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
  });
}
