import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTranslation } from 'react-i18next';

import { ChecklistSessionWizard } from './ChecklistSessionWizard.js';

const reactMocks = vi.hoisted(() => ({ useState: vi.fn() }));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useState: reactMocks.useState };
});

function useStateAtCalls(overrides: Record<number, unknown>) {
  let callCount = 0;
  reactMocks.useState.mockImplementation((initialState: unknown) => {
    callCount++;
    return [callCount in overrides ? overrides[callCount] : initialState, vi.fn()];
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

function Wrapper() {
  const { t } = useTranslation();
  return <ChecklistSessionWizard onClose={vi.fn()} onCreated={vi.fn()} open={true} t={t} />;
}

describe('ChecklistSessionWizard', () => {
  it('renders a closed wizard dialog with a numbered step tracker', () => {
    reactMocks.useState.mockImplementation((initialState: unknown) => [initialState, vi.fn()]);
    const html = renderToStaticMarkup(<Wrapper />);
    expect(html).toContain('<dialog');
    expect(html).toContain('ds-wizard-dialog');
    expect(html).toContain('aria-current="step"');
  });

  // PR 303: useState call order -- 1 step, 2 learnerSearch, 3 useDebounced(learnerSearch)'s own
  // state, 4 learnerResults, 5 selectedLearners, 6 observerSearch, 7 useDebounced(observerSearch)'s
  // own state, 8 observerResults, 9 selectedObserver, 10 checklists, 11 selectedChecklistId,
  // 12 scheduleMode. Everything after 12 (scheduledAt, locationPolicy, submitting, ...) is left at
  // its default, which is fine -- these two tests only care about step 2's schedule-mode branch.
  it('shows the timezone line when scheduling for later', () => {
    useStateAtCalls({ 1: 2, 12: 'later' });
    const html = renderToStaticMarkup(<Wrapper />);
    expect(html).toContain('Часовой пояс:');
  });

  it('hides the timezone line for "start now" -- nothing for it to disambiguate', () => {
    useStateAtCalls({ 1: 2, 12: 'now' });
    const html = renderToStaticMarkup(<Wrapper />);
    expect(html).not.toContain('Часовой пояс:');
  });

  // PR 318: the picklist row's control used to render centred (global.css's `input { width: 100% }`
  // stretched the radio/checkbox itself), pushing the participant's name to the row's right edge
  // and wrapping it. Call 8 is `observerResults` per the useState-order comment above.
  it('renders each observer picklist row as name and email, not a single wrapped string', () => {
    useStateAtCalls({ 8: [{ id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'olga@example.invalid', position: null }] });
    const html = renderToStaticMarkup(<Wrapper />);
    expect(html).toContain('ds-wizard-dialog__picklist-name');
    expect(html).toContain('ds-wizard-dialog__picklist-email');
    expect(html).toContain('Olga Observer');
    expect(html).toContain('olga@example.invalid');
  });
});
