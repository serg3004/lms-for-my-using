import type { Page } from '@playwright/test';
import type { ChecklistInstanceSummary, ChecklistSessionSummary, ChecklistSummary } from '../../web/src/shared/api/types.js';

export async function installCriterionScaleMocks(page: Page, role: 'learner' | 'instructor') {
  const checklist: ChecklistSummary = {
    id: 'scale-checklist', organizationId: 'scale-org', title: 'Mixed criterion scales', description: null,
    status: 'published', scoringMode: 'sum_points', passThreshold: 70, scaleLevels: null, requiresReview: true,
    createdBy: 'admin', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    items: [
      { id: 'quality', checklistId: 'scale-checklist', order: 0, text: 'Rate quality', points: 999, weight: 2, isRequired: true, photoRequired: false, scaleId: 'quality-scale', scale: { id: 'quality-scale', name: 'Quality', levels: [{ value: 1, label: 'No', score: 0 }, { value: 4, label: 'Excellent', score: 40 }] } },
      { id: 'safety', checklistId: 'scale-checklist', order: 1, text: 'Rate safety', points: 999, weight: 3, isRequired: true, photoRequired: false, scaleId: 'safety-scale', scale: { id: 'safety-scale', name: 'Safety', levels: [{ value: 7, label: 'Unsafe', score: 0 }, { value: 9, label: 'Safe', score: 10 }] } },
    ],
  };
  const instance: ChecklistInstanceSummary = {
    id: 'scale-instance', organizationId: 'scale-org', checklistId: checklist.id, userId: 'learner', assignedBy: 'admin', reviewerId: null, reviewAssignedAt: null, reviewAssignedBy: null,
    status: 'in_progress', totalScore: 0, maxScore: 110, percentage: 0, passed: false, dueAt: null,
    submittedAt: null, completedAt: null, createdAt: checklist.createdAt, updatedAt: checklist.updatedAt, checklist, results: [],
  };
  const session: ChecklistSessionSummary = {
    id: 'scale-session', organizationId: 'scale-org', instanceId: instance.id, observerId: 'viewer', status: 'in_progress', version: 1,
    scheduledAt: null, durationMinutes: null, startedAt: checklist.createdAt, pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false,
    strengths: null, developmentAreas: null, nextSteps: null, observerUnavailableReason: null, observerUnavailableAt: null,
    createdAt: checklist.createdAt, updatedAt: checklist.updatedAt, checklist: { id: checklist.id, title: checklist.title },
    learner: { id: 'learner', firstName: 'Alex', lastName: 'Learner', email: 'learner@example.invalid' },
    observer: { id: 'viewer', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
    result: { instanceStatus: 'in_progress', percentage: 0, passed: false, scored: true, visible: true },
  };
  const writes: { itemId: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: role === 'learner' ? 'learner' : 'viewer', organizationId: 'scale-org', firstName: 'Scale', lastName: 'Viewer', email: 'viewer@example.invalid', roles: [role], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/checklist-instances/mine') return route.fulfill({ json: [instance] });
    if (path === '/checklist-instances/scale-instance') return route.fulfill({ json: instance });
    if (path === '/checklist-sessions/scale-session/conduct') return route.fulfill({ json: session });
    if (path === '/checklists/free') return route.fulfill({ json: [] });
    const item = checklist.items.find((item) => path === `/checklist-instances/scale-instance/items/${item.id}`);
    if (item && route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON(); writes.push({ itemId: item.id, body });
      let result = instance.results.find((row) => row.itemId === item.id);
      if (!result) {
        result = { id: `result-${item.id}`, itemId: item.id, checked: false, scaleLevel: null, points: 0, answerState: 'unanswered', photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null };
        instance.results.push(result);
      }
      if (body.scaleLevel !== undefined) {
        result.scaleLevel = body.scaleLevel;
        result.points = item.scale!.levels.find((level) => level.value === body.scaleLevel)!.score;
        result.answerState = 'answered';
      }
      if (body.comment !== undefined) result.comment = body.comment;
      instance.totalScore = instance.results.reduce((sum, result) => sum + result.points * (checklist.items.find((item) => item.id === result.itemId)!.weight ?? 1), 0);
      instance.percentage = Math.round(instance.totalScore / instance.maxScore * 100);
      return route.fulfill({ json: instance });
    }
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 50 } });
  });
  return { writes, instance };
}

export async function openCriterionScalePage(page: Page, role: 'learner' | 'instructor') {
  await page.clock.setFixedTime(new Date('2026-01-01T00:05:00Z'));
  const data = await installCriterionScaleMocks(page, role);
  await page.goto(role === 'learner' ? '/learn/checklists' : '/instructor/checklists/sessions/scale-session');
  if (role === 'learner') await page.getByText('Mixed criterion scales', { exact: true }).click();
  await page.getByRole('button', { name: /\bNo\b/, exact: false }).waitFor();
  return data;
}
