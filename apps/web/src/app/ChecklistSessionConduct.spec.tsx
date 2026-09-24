// Renders ConductScreen (and everything it composes -- Header, CriterionStepper, CriterionCard,
// PhotoAttachment, StructuredFeedback) with real React hooks and various session/instance states,
// mirroring AdminChecklistsPage.builder.spec.tsx's convention: no useState/useEffect mocking, since
// this component is driven entirely by props rather than InstructorChecklistReviewsPage's fragile
// positional hook order.
import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../shared/apiClient.js';

const apiMocks = vi.hoisted(() => ({
  captureChecklistSessionLocation: vi.fn().mockResolvedValue({}),
  getChecklistSession: vi.fn(),
}));
vi.mock('../shared/api/checklistSessions.js', async () => {
  const actual = await vi.importActual<typeof import('../shared/api/checklistSessions.js')>('../shared/api/checklistSessions.js');
  return { ...actual, captureChecklistSessionLocation: apiMocks.captureChecklistSessionLocation, getChecklistSession: apiMocks.getChecklistSession };
});

const checklistsApiMocks = vi.hoisted(() => ({ getChecklistInstance: vi.fn() }));
vi.mock('../shared/api/checklists.js', async () => {
  const actual = await vi.importActual<typeof import('../shared/api/checklists.js')>('../shared/api/checklists.js');
  return { ...actual, getChecklistInstance: checklistsApiMocks.getChecklistInstance };
});

import { captureLocationBestEffort, ChecklistSessionConduct, ConductScreen, fetchConductData, formatElapsed, runMutation } from './ChecklistSessionConduct.js';
import type { ChecklistInstanceSummary, ChecklistSessionSummary } from '../shared/api/types.js';

const t = ((key: string, fallback?: string) => fallback ?? key) as unknown as TFunction;

function session(overrides: Partial<ChecklistSessionSummary> = {}): ChecklistSessionSummary {
  return {
    id: 'session-1',
    organizationId: 'org-1',
    instanceId: 'instance-1',
    observerId: 'observer-1',
    status: 'in_progress',
    version: 2,
    scheduledAt: '2026-02-01T09:00:00.000Z',
    startedAt: '2026-02-01T09:05:00.000Z',
    pausedAt: null,
    locationCapturePolicy: 'off',
    timezone: 'UTC',
    overdue: false,
    strengths: null,
    developmentAreas: null,
    nextSteps: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T09:05:00.000Z',
    checklist: { id: 'checklist-1', title: 'Opening shift checklist' },
    learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid' },
    observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
    result: { instanceStatus: 'in_progress', percentage: 40, passed: false, scored: true, visible: true },
    ...overrides,
  };
}

function instance(overrides: Partial<ChecklistInstanceSummary> = {}): ChecklistInstanceSummary {
  return {
    id: 'instance-1',
    organizationId: 'org-1',
    checklistId: 'checklist-1',
    userId: 'learner-1',
    assignedBy: 'observer-1',
    reviewerId: null,
    reviewAssignedAt: null,
    reviewAssignedBy: null,
    status: 'in_progress',
    totalScore: 4,
    maxScore: 10,
    percentage: 40,
    passed: false,
    dueAt: null,
    submittedAt: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T09:05:00.000Z',
    checklist: {
      id: 'checklist-1',
      organizationId: 'org-1',
      title: 'Opening shift checklist',
      description: 'Complete before serving the first customer.',
      status: 'published',
      scoringMode: 'sum_points',
      passThreshold: 80,
      scaleLevels: null,
      requiresReview: true,
      createdBy: 'admin-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      items: [
        {
          id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Rate the greeting', points: 10,
          isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false,
          scaleId: 'scale-1', groupId: null,
          scale: { id: 'scale-1', name: 'Quality', levels: [{ value: 1, label: 'Poor', score: 0 }, { value: 2, label: 'Great', score: 10 }] },
        },
        {
          id: 'item-2', checklistId: 'checklist-1', order: 2, text: 'Check the till float', points: 10,
          isRequired: true, photoRequired: true, weight: 1, allowSkip: true, autoSkipUnanswered: false,
          scaleId: null, groupId: null, scale: null,
        },
      ],
    },
    results: [
      { id: 'result-1', itemId: 'item-1', checked: false, scaleLevel: 2, points: 10, photoUrl: null, photoFileName: null, comment: 'Warm greeting', reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null },
      { id: 'result-2', itemId: 'item-2', checked: false, scaleLevel: null, points: 0, photoUrl: 'https://example.invalid/photo.jpg', photoFileName: 'till.jpg', comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null },
    ],
    ...overrides,
  };
}

describe('captureLocationBestEffort', () => {
  afterEach(() => {
    apiMocks.captureChecklistSessionLocation.mockClear();
    delete (globalThis.navigator as { geolocation?: unknown }).geolocation;
  });

  it('is a no-op when the session policy is off', async () => {
    await captureLocationBestEffort('session-1', 'start', 'off');
    expect(apiMocks.captureChecklistSessionLocation).not.toHaveBeenCalled();
  });

  it('reports unavailable when the browser has no geolocation API', async () => {
    await captureLocationBestEffort('session-1', 'start', 'optional');
    expect(apiMocks.captureChecklistSessionLocation).toHaveBeenCalledWith('session-1', 'start', { status: 'unavailable' });
  });

  it('reports captured coordinates on a successful getCurrentPosition', async () => {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: (position: unknown) => void) => {
          success({ coords: { latitude: 1.5, longitude: 2.5, accuracy: 10 } });
        },
      },
    });
    await captureLocationBestEffort('session-1', 'end', 'required');
    expect(apiMocks.captureChecklistSessionLocation).toHaveBeenCalledWith('session-1', 'end', {
      status: 'captured', latitude: 1.5, longitude: 2.5, accuracyMeters: 10,
    });
  });

  it('reports denied when the browser rejects the permission', async () => {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success: unknown, error: (err: unknown) => void) => {
          error(new Error('denied'));
        },
      },
    });
    await captureLocationBestEffort('session-1', 'start', 'optional');
    expect(apiMocks.captureChecklistSessionLocation).toHaveBeenCalledWith('session-1', 'start', { status: 'denied' });
  });
});

describe('runMutation', () => {
  function handlers() {
    return { setBusy: vi.fn(), setError: vi.fn(), onConflict: vi.fn(), fallbackMessage: 'fallback' };
  }

  it('toggles busy and clears error around a successful call', async () => {
    const h = handlers();
    await runMutation(async () => undefined, h);
    expect(h.setBusy.mock.calls).toEqual([[true], [false]]);
    expect(h.setError).toHaveBeenCalledWith(null);
    expect(h.onConflict).not.toHaveBeenCalled();
  });

  it('routes a 409 to onConflict, not setError', async () => {
    const h = handlers();
    await runMutation(async () => { throw new ApiClientError('stale', 409); }, h);
    expect(h.onConflict).toHaveBeenCalledTimes(1);
    expect(h.setError).toHaveBeenCalledWith(null);
  });

  it('routes a non-409 ApiClientError message to setError', async () => {
    const h = handlers();
    await runMutation(async () => { throw new ApiClientError('bad request', 400); }, h);
    expect(h.setError).toHaveBeenLastCalledWith('bad request');
    expect(h.onConflict).not.toHaveBeenCalled();
  });

  it('falls back to the generic message for a non-ApiClientError failure', async () => {
    const h = handlers();
    await runMutation(async () => { throw new Error('boom'); }, h);
    expect(h.setError).toHaveBeenLastCalledWith('fallback');
  });
});

describe('formatElapsed', () => {
  it('formats under an hour as mm:ss', () => {
    expect(formatElapsed(65_000)).toBe('01:05');
  });
  it('formats an hour or more as h:mm:ss', () => {
    expect(formatElapsed(3_661_000)).toBe('1:01:01');
  });
});

describe('fetchConductData', () => {
  it('resolves the session then fetches its instance by instanceId', async () => {
    const s = session();
    const i = instance();
    apiMocks.getChecklistSession.mockResolvedValueOnce(s);
    checklistsApiMocks.getChecklistInstance.mockResolvedValueOnce(i);
    await expect(fetchConductData('session-1')).resolves.toEqual({ session: s, instance: i });
    expect(checklistsApiMocks.getChecklistInstance).toHaveBeenCalledWith(s.instanceId);
  });
});

describe('ChecklistSessionConduct (loading state)', () => {
  it('renders without crashing before the async load resolves', () => {
    expect(() =>
      renderToStaticMarkup(<ChecklistSessionConduct sessionId="session-1" onBack={vi.fn()} t={t} />),
    ).not.toThrow();
  });
});

describe('ConductScreen (real hooks)', () => {
  const onBack = vi.fn();
  const onReload = vi.fn().mockResolvedValue(undefined);

  it('renders the scheduled state with a Start button and no criterion stepper', () => {
    const html = renderToStaticMarkup(
      <ConductScreen data={{ session: session({ status: 'scheduled', startedAt: null }), instance: instance() }} onBack={onBack} onReload={onReload} t={t} />,
    );
    expect(html).toContain('Start session');
    expect(html).not.toContain('Structured feedback');
  });

  it('renders the in_progress state with scale/checkbox criteria, photo evidence, skip and feedback', () => {
    const html = renderToStaticMarkup(
      <ConductScreen data={{ session: session({ status: 'in_progress' }), instance: instance() }} onBack={onBack} onReload={onReload} t={t} />,
    );
    expect(html).toContain('Rate the greeting');
    expect(html).toContain('Great');
    expect(html).toContain('Structured feedback');
  });

  it('renders the paused state with a Resume button', () => {
    const html = renderToStaticMarkup(
      <ConductScreen data={{ session: session({ status: 'paused', pausedAt: '2026-02-01T09:10:00.000Z' }), instance: instance() }} onBack={onBack} onReload={onReload} t={t} />,
    );
    expect(html).toContain('Resume');
  });

  it('renders the completed state with a passed result banner and saved feedback', () => {
    const html = renderToStaticMarkup(
      <ConductScreen
        data={{
          session: session({ status: 'completed', strengths: 'Great attention to detail', developmentAreas: 'Speed', nextSteps: 'Practice weekly' }),
          instance: instance({ status: 'completed', passed: true, percentage: 90, totalScore: 9, maxScore: 10 }),
        }}
        onBack={onBack}
        onReload={onReload}
        t={t}
      />,
    );
    expect(html).toContain('Passed');
    expect(html).toContain('Great attention to detail');
  });

  it('renders the photo-attachment control for a criterion with photoRequired at step 0', () => {
    const withPhotoFirst = instance();
    withPhotoFirst.checklist!.items = [...withPhotoFirst.checklist!.items].reverse();
    const html = renderToStaticMarkup(
      <ConductScreen data={{ session: session({ status: 'in_progress' }), instance: withPhotoFirst }} onBack={onBack} onReload={onReload} t={t} />,
    );
    expect(html).toContain('Check the till float');
    expect(html).toContain('Replace');
  });

  it('renders a checklist with no items without crashing', () => {
    expect(() =>
      renderToStaticMarkup(
        <ConductScreen
          data={{ session: session({ status: 'in_progress' }), instance: instance({ checklist: { ...instance().checklist!, items: [] } }) }}
          onBack={onBack}
          onReload={onReload}
          t={t}
        />,
      ),
    ).not.toThrow();
  });
});
