import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import type { ChecklistReportHighlight, ChecklistSessionReport } from '../../shared/api/types.js';

vi.mock('../../shared/api/checklists.js', () => ({ getChecklistItemPhotoUrl: vi.fn(() => new Promise(() => undefined)) }));

import { criterionStatus, highlightedRowStyle, ReportCriteria, ReportSummary } from './SessionReportView.js';

const t = ((key: string, fallback?: string, params?: Record<string, unknown>) => {
  const text = fallback ?? key;
  return params ? text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? '')) : text;
}) as unknown as TFunction;

const style = (color: string, fill: string, text: string): ChecklistReportHighlight => ({
  color, light: { fill, text }, dark: { fill: '#102010', text: '#FFFFFF' },
});
const green = style('#2E7D32', '#DDEBDE', '#111111');
const orange = style('#E65100', '#FBE6D9', '#111111');
const red = style('#C62828', '#F4DCDC', '#111111');

const person = (id: string, name: string, department: string | null) => ({
  id, firstName: name, lastName: 'Test', email: `${id}@example.invalid`, department: department ? { id: `d-${id}`, name: department } : null,
});

function makeReport(overrides: Partial<ChecklistSessionReport> = {}): ChecklistSessionReport {
  return {
    sessionId: 's1', instanceId: 'i1', checklist: { id: 'c1', title: '5S audit' }, visible: true,
    header: {
      status: 'completed', timezone: 'UTC',
      scheduledStart: '2026-02-01T09:00:00.000Z', scheduledEnd: '2026-02-01T10:00:00.000Z',
      startedAt: '2026-02-01T09:05:00.000Z', completedAt: '2026-02-01T09:50:00.000Z',
      learner: person('l1', 'Leo', 'Warehouse'), observer: person('o1', 'Olga', 'Quality'),
    },
    generalInfo: [{ id: 'f1', label: 'Store number', type: 'text', value: 'A-12' }],
    summary: {
      scored: true, percentage: 90, totalScore: 71, maxScore: 79, criteriaCount: 27, answeredCount: 27, skippedCount: 0,
      passed: true, passThreshold: 80, formula: 'snapshot', color: green,
    },
    groups: [
      { id: 'g1', number: '1', title: 'Sort', score: 1, maxScore: 1, percentage: 100, criteriaCount: 1, color: green },
      { id: 'g2', number: '2', title: 'Set in order', score: 70, maxScore: 78, percentage: 90, criteriaCount: 26, color: green },
    ],
    criteria: [
      { id: 'k1', number: '1.1', groupId: 'g1', text: 'Aisles are clear', state: 'answered', score: 3, maxScore: 3, levelLabel: 'Sustained', comment: 'Great', photo: null, reviewStatus: null, color: green },
      { id: 'k2', number: '2.1', groupId: 'g2', text: 'Tools are labelled', state: 'answered', score: 1, maxScore: 3, levelLabel: 'Partial', comment: null, photo: { fileName: 'tools.jpg' }, reviewStatus: null, color: orange },
      { id: 'k3', number: '2.2', groupId: 'g2', text: 'Floor is dry', state: 'answered', score: 0, maxScore: 3, levelLabel: 'None', comment: null, photo: null, reviewStatus: null, color: red },
      { id: 'k4', number: '2.3', groupId: 'g2', text: 'Signs are visible', state: 'skipped', score: null, maxScore: null, levelLabel: null, comment: null, photo: null, reviewStatus: null, color: null },
    ],
    feedback: { strengths: 'Tidy', developmentAreas: 'Labels', comment: 'Keep going' },
    location: { policy: 'off', captures: [] },
    ...overrides,
  };
}

describe('criterionStatus', () => {
  it('classifies full, partial, zero, skipped and unanswered rows', () => {
    expect(criterionStatus({ state: 'answered', score: 3, maxScore: 3 })).toBe('full');
    expect(criterionStatus({ state: 'answered', score: 1, maxScore: 3 })).toBe('partial');
    expect(criterionStatus({ state: 'answered', score: 0, maxScore: 3 })).toBe('zero');
    expect(criterionStatus({ state: 'skipped', score: null, maxScore: null })).toBe('skipped');
    expect(criterionStatus({ state: 'unanswered', score: 0, maxScore: 3 })).toBe('unanswered');
  });
});

describe('highlightedRowStyle', () => {
  it('paints a stripe and fill from the server colours, nothing when there is no colour', () => {
    expect(highlightedRowStyle(green)).toMatchObject({ background: '#DDEBDE', color: '#111111', borderLeft: '6px solid #2E7D32' });
    expect(highlightedRowStyle(null)).toEqual({ border: '1px solid #e3e8ef' });
  });
});

describe('ReportSummary', () => {
  it('shows the header, general information, the big total, feedback and the group table', () => {
    const html = renderToStaticMarkup(<ReportSummary report={makeReport()} t={t} />);
    expect(html).toContain('Leo Test, Warehouse');
    expect(html).toContain('Olga Test, Quality');
    expect(html).toContain('Store number');
    expect(html).toContain('A-12');
    expect(html).toContain('90% — 71 of 79 points across 27 criteria');
    expect(html).toContain('Passed');
    expect(html).toContain('Tidy');
    expect(html).toContain('Keep going');
    expect(html).toContain('1. Sort');
    expect(html).toContain('90% — 70 of 78');
    expect(html).toContain('stroke="#2E7D32"');
    expect(html).toContain('border-left:6px solid #2E7D32');
  });

  it('shows "Not scored (all skipped)" and no arc fill when every criterion was skipped', () => {
    const base = makeReport();
    const report = makeReport({ summary: { ...base.summary!, scored: false, percentage: null, totalScore: 0, maxScore: 0, answeredCount: 0, skippedCount: 27, passed: null, color: null } });
    const html = renderToStaticMarkup(<ReportSummary report={report} t={t} />);
    expect(html).toContain('Not scored (all skipped)');
    expect(html).not.toContain('stroke-dasharray');
  });

  it('keeps the header and general information but hides the result when the feedback rules hide it', () => {
    const report = makeReport({ visible: false, summary: null, groups: [], criteria: [], feedback: null });
    const html = renderToStaticMarkup(<ReportSummary report={report} t={t} />);
    expect(html).toContain('Store number');
    expect(html).toContain('The result will be shown once the feedback rules allow it.');
    expect(html).not.toContain('71 of 79');
  });

  it('marks an unfinished session as not final', () => {
    const base = makeReport();
    const report = makeReport({ header: { ...base.header, status: 'in_progress', completedAt: null } });
    expect(renderToStaticMarkup(<ReportSummary report={report} t={t} />)).toContain('The session is not finished yet');
  });
});

describe('ReportCriteria', () => {
  it('renders numbered rows grouped by group with score, level, comment and a symbol plus text per status', () => {
    const html = renderToStaticMarkup(<ReportCriteria report={makeReport()} t={t} />);
    expect(html).toContain('2. Set in order');
    expect(html).toContain('1.1');
    expect(html).toContain('3 of 3');
    expect(html).toContain('Full score');
    expect(html).toContain('1 of 3');
    expect(html).toContain('Partial score');
    expect(html).toContain('No points');
    expect(html).toContain('Skipped');
    expect(html).toContain('Sustained');
    expect(html).toContain('Great');
    expect(html).toContain('tools.jpg');
    expect(html).toContain('✓');
    expect(html).toContain('⚠');
    expect(html).toContain('✕');
    expect(html).toContain('background:#FBE6D9');
  });

  it('shows the empty and hidden states', () => {
    expect(renderToStaticMarkup(<ReportCriteria report={makeReport({ criteria: [], groups: [] })} t={t} />)).toContain('This checklist has no criteria.');
    expect(renderToStaticMarkup(<ReportCriteria report={makeReport({ visible: false })} t={t} />)).toContain('The result will be shown');
  });
});
