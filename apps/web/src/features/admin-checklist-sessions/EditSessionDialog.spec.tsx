import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useTranslation } from 'react-i18next';

import { EditSessionDialog } from './EditSessionDialog.js';
import type { ChecklistSessionSummary } from '../../shared/api/types.js';

function makeSession(overrides: Partial<ChecklistSessionSummary> = {}): ChecklistSessionSummary {
  return {
    id: 'session-1', organizationId: 'org-1', instanceId: 'instance-1', observerId: 'observer-1',
    status: 'scheduled', version: 3, scheduledAt: '2026-02-01T09:00:00.000Z', startedAt: null,
    durationMinutes: null,
    pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false,
    strengths: null, developmentAreas: null, nextSteps: null,
    observerUnavailableReason: null, observerUnavailableAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    checklist: { id: 'checklist-1', title: 'Opening shift checklist' },
    learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid' },
    observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
    result: { instanceStatus: 'assigned', percentage: 0, passed: false, scored: false, visible: true },
    ...overrides,
  };
}

function Wrapper({ session }: { session: ChecklistSessionSummary | null }) {
  const { t } = useTranslation();
  return <EditSessionDialog onClose={vi.fn()} onSaved={vi.fn()} session={session} t={t} />;
}

describe('EditSessionDialog (PR 333)', () => {
  it('renders a closed dialog shell when no target session is set', () => {
    const html = renderToStaticMarkup(<Wrapper session={null} />);
    expect(html).toContain('<dialog');
    expect(html).toContain('ds-wizard-dialog');
  });

  it('renders one step with the time field, the current observer and the picklist for another one', () => {
    const html = renderToStaticMarkup(<Wrapper session={makeSession()} />);
    expect(html).toContain('Время и наблюдатель');
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('Olga');
    expect(html).toContain('ds-wizard-dialog__picklist');
  });

  it("surfaces the reported unavailability reason so the admin knows why they're reassigning", () => {
    const html = renderToStaticMarkup(<Wrapper session={makeSession({ observerUnavailableReason: 'Out sick' })} />);
    expect(html).toContain('Out sick');
    expect(html).toContain('Сообщил о недоступности');
  });

  it('never shows the unavailability banner when no reason was reported', () => {
    const html = renderToStaticMarkup(<Wrapper session={makeSession({ observerUnavailableReason: null })} />);
    expect(html).not.toContain('Сообщил о недоступности');
  });
});
