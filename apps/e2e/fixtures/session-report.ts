import type { ChecklistReportHighlight, ChecklistSessionReport, ChecklistSessionSummary } from '../../web/src/shared/api/types.js';

const highlight = (color: string, fill: string): ChecklistReportHighlight => ({
  color, light: { fill, text: '#111111' }, dark: { fill: '#1B2A1B', text: '#FFFFFF' },
});
export const reportGreen = highlight('#2E7D32', '#DDEBDE');
export const reportOrange = highlight('#E65100', '#FBE6D9');
export const reportRed = highlight('#C62828', '#F4DCDC');

type ReportSession = Pick<ChecklistSessionSummary, 'id' | 'instanceId' | 'scheduledAt' | 'startedAt' | 'timezone' | 'checklist' | 'learner' | 'observer'>
  & Partial<Pick<ChecklistSessionSummary, 'strengths' | 'developmentAreas' | 'nextSteps'>>
  & { status: string; locationCapturePolicy?: string; result: { percentage: number | null; passed: boolean | null; scored: boolean | null; visible: boolean } };

/**
 * What GET /checklist-sessions/:id/report (PR 370) returns for a small two-group sheet: the e2e and
 * visual tests route it next to the session, because the summary and criteria tabs (PR 371) render
 * only this report. The session's own result decides the headline percentage.
 */
export function sessionReportFixture(session: ReportSession, overrides: Partial<ChecklistSessionReport> = {}): ChecklistSessionReport {
  const { percentage, passed, scored } = session.result;
  const finished = session.status === 'completed';
  return {
    sessionId: session.id,
    instanceId: session.instanceId,
    checklist: session.checklist,
    visible: session.result.visible,
    header: {
      status: session.status as ChecklistSessionSummary['status'],
      timezone: session.timezone,
      scheduledStart: session.scheduledAt,
      scheduledEnd: null,
      startedAt: session.startedAt,
      completedAt: finished ? session.startedAt : null,
      learner: { ...session.learner, department: { id: 'department-1', name: 'Warehouse' } },
      observer: { ...session.observer, department: null },
    },
    generalInfo: [],
    summary: {
      scored: scored === true,
      percentage: scored ? percentage : null,
      totalScore: 7,
      maxScore: 9,
      criteriaCount: 3,
      answeredCount: 3,
      skippedCount: 0,
      passed,
      passThreshold: 80,
      formula: 'snapshot',
      color: scored ? ((percentage ?? 0) >= 80 ? reportGreen : reportOrange) : null,
    },
    groups: [
      { id: 'group-1', number: '1', title: 'Opening', score: 3, maxScore: 3, percentage: 100, criteriaCount: 1, color: reportGreen },
      { id: 'group-2', number: '2', title: 'Cash desk', score: 4, maxScore: 6, percentage: 67, criteriaCount: 2, color: reportOrange },
    ],
    criteria: [
      { id: 'criterion-1', number: '1.1', groupId: 'group-1', text: 'Lights are on', state: 'answered', score: 3, maxScore: 3, levelLabel: 'Sustained', comment: null, photo: null, reviewStatus: null, color: reportGreen },
      { id: 'criterion-2', number: '2.1', groupId: 'group-2', text: 'Cash is counted', state: 'answered', score: 3, maxScore: 3, levelLabel: 'Sustained', comment: 'Counted twice', photo: null, reviewStatus: null, color: reportGreen },
      { id: 'criterion-3', number: '2.2', groupId: 'group-2', text: 'Receipts are filed', state: 'answered', score: 1, maxScore: 3, levelLabel: 'Partial', comment: null, photo: null, reviewStatus: null, color: reportOrange },
    ],
    feedback: { strengths: session.strengths ?? null, developmentAreas: session.developmentAreas ?? null, comment: session.nextSteps ?? null },
    location: { policy: (session.locationCapturePolicy ?? 'off') as ChecklistSessionSummary['locationCapturePolicy'], captures: [] },
    ...overrides,
  };
}
