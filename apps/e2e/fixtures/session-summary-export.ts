import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import type { ChecklistSessionSummaryExport } from '../../web/src/shared/api/types.js';

export const summaryGolden = JSON.parse(readFileSync(new URL('../../../tests/fixtures/checklist-session-summary-5s.json', import.meta.url), 'utf8'));
const labels = {
  ru: { xlsx: 'Скачать сводку (Excel)', csv: 'Скачать сводку (CSV)' },
  en: { xlsx: 'Download summary (Excel)', csv: 'Download summary (CSV)' },
  kk: { xlsx: 'Жиынтықты жүктеу (Excel)', csv: 'Жиынтықты жүктеу (CSV)' },
  zh: { xlsx: '下载汇总（Excel）', csv: '下载汇总（CSV）' },
};

function goldenTable(): Pick<ChecklistSessionSummaryExport, 'rows' | 'layout'> {
  return structuredClone(summaryGolden.exportTable);
}

export async function openSummaryReport(page: Page, options: {
  role?: 'admin' | 'instructor' | 'mentor'; locale?: keyof typeof labels; hidden?: boolean; status?: 'completed' | 'scheduled';
} = {}) {
  const role = options.role ?? 'admin', locale = options.locale ?? 'ru';
  const report = structuredClone(summaryGolden.report);
  const session = {
    id: report.sessionId, instanceId: report.instanceId, organizationId: 'summary-org', observerId: report.header.observer.id,
    status: options.status ?? 'completed', version: 1, scheduledAt: report.header.scheduledStart, startedAt: report.header.startedAt,
    durationMinutes: 60, pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false,
    strengths: report.feedback.strengths, developmentAreas: report.feedback.developmentAreas, nextSteps: report.feedback.comment,
    checklist: report.checklist, learner: report.header.learner, observer: report.header.observer,
    result: { instanceStatus: 'completed', percentage: 90, passed: true, scored: true, visible: !options.hidden },
    createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T11:00:00Z',
  };
  if (options.hidden) { report.visible = false; report.summary = null; report.criteria = []; report.groups = []; report.feedback = null; report.generalInfo = []; }
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'summary-viewer', organizationId: 'summary-org', firstName: 'Test', lastName: 'Viewer', email: 'viewer@example.invalid', roles: [role], status: 'active', locale, timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === `/checklist-sessions/${session.id}`) return route.fulfill({ json: session });
    if (path === `/checklist-sessions/${session.id}/report`) return route.fulfill({ json: report });
    if (path === `/checklist-instances/${session.instanceId}`) return route.fulfill({ json: { id: session.instanceId, checklistId: 'sheet', userId: 'employee', status: 'completed', percentage: 90, passed: true, scored: true, checklist: { ...report.checklist, scoringMode: 'sum_points', items: [] }, results: [] } });
    if (path.endsWith('/score-revisions') || path.endsWith('/location') || path.endsWith('/events')) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { message: 'Unknown read-only quality fixture route' } });
  });
  const requests: { ids: string | null; format: string | null }[] = [];
  let responseStatus = 200, responseMessage = '', hold = false;
  let release: (() => void) | undefined;
  const table = goldenTable();
  await page.route('**/api/v1/checklist-sessions/export/summary?*', async (route) => {
    const url = new URL(route.request().url());
    requests.push({ ids: url.searchParams.get('ids'), format: url.searchParams.get('format') });
    if (hold) await new Promise<void>((resolve) => { release = resolve; });
    if (responseStatus !== 200) return route.fulfill({ status: responseStatus, json: { message: responseMessage } });
    return route.fulfill({ json: { ...table, rowCount: table.rows.length, sessionIds: [session.id], filename: `session-summary.${url.searchParams.get('format')}`, csv: '\uFEFF"Отчёт Сводка по сессии"\r\n"\'=Employee","90%","71 из 79"\r\n' } });
  });
  const base = role === 'instructor' ? '/instructor/checklists/sessions/all' : role === 'mentor' ? '/mentor/sessions' : '/admin/checklists/sessions';
  await page.goto(`${base}/${session.id}`);
  await expect(page.getByRole('heading', { name: '5S', exact: true })).toBeVisible();
  return { labels: labels[locale], sessionId: session.id, requests, fail: (status: number, message: string) => { responseStatus = status; responseMessage = message; },
    pause: () => { hold = true; }, resume: () => { hold = false; release?.(); } };
}
