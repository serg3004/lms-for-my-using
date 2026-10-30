// @vitest-environment jsdom
import '../../i18n/index.js';

import i18n from 'i18next';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ exportSummary: vi.fn(), list: vi.fn() }));
vi.mock('../../shared/api/checklistSessions.js', () => ({
  exportChecklistSessionSummary: api.exportSummary,
  listChecklistSessions: api.list,
}));
vi.mock('../../shared/downloadCsv.js', () => ({ downloadCsvFile: vi.fn() }));
vi.mock('../../shared/downloadSummaryXlsx.js', () => ({ downloadSummaryXlsx: vi.fn() }));

import type { ChecklistSessionSummary } from '../../shared/api/types.js';
import { DataTable } from '../../shared/ui.js';
import { canExportSummary, ChecklistSummarySelection } from './ChecklistSummarySelection.js';
import { EmployeeObservationsSummary } from './EmployeeObservationsSummary.js';

const make = (id: string, over: Partial<ChecklistSessionSummary> = {}) => ({
  id, status: 'completed', timezone: 'UTC', startedAt: `2026-02-0${id.slice(-1)}T09:00:00.000Z`, scheduledAt: null,
  checklist: { id: 'c1', title: '5S' }, learner: { id: 'l1', firstName: 'Leo', lastName: 'L', email: 'l@example.invalid' },
  ...over,
}) as unknown as ChecklistSessionSummary;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLElement;
const t = i18n.t.bind(i18n) as never;
beforeEach(async () => {
  await i18n.changeLanguage('en');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  api.exportSummary.mockReset(); api.list.mockReset();
  api.exportSummary.mockResolvedValue({ filename: 'summary.csv', csv: 'a' });
});
afterEach(async () => { vi.unstubAllGlobals(); if (root) await act(async () => { root?.unmount(); }); root = undefined; document.body.innerHTML = ''; });

function List({ rows }: { rows: ChecklistSessionSummary[] }) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  return <DataTable
    columns={[{ key: 'id', label: 'Id', priority: 'primary', render: (row) => row.id }]}
    keyExtractor={(row) => row.id} label="Sessions" rows={rows}
    responsiveDetails={{ label: 'Details', expandLabel: () => 'Expand', collapseLabel: () => 'Collapse' }}
    selection={{ selectedKeys, onChange: setSelectedKeys, isRowSelectable: canExportSummary, rowLabel: (row) => `pick ${row.id}` }}
    batchActions={(selected) => <ChecklistSummarySelection selected={selected} t={t} />} />;
}
const box = (label: string) => host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

describe('summary of several observations (PR 375)', () => {
  it('lets only completed sessions be selected', async () => {
    await act(async () => { root?.render(<List rows={[make('s1'), make('s2', { status: 'scheduled' })]} />); });
    expect(box('pick s1').disabled).toBe(false);
    expect(box('pick s2').disabled).toBe(true);
  });

  it('exports the selected ids of one checklist in one request', async () => {
    await act(async () => { root?.render(<List rows={[make('s1'), make('s3')]} />); });
    await click(box('pick s1')); await click(box('pick s3'));
    const button = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Download summary (CSV)')!;
    await click(button);
    expect(api.exportSummary).toHaveBeenCalledWith(['s1', 's3'], 'csv');
  });

  it('asks for sessions of one checklist instead of exporting several sheets', async () => {
    await act(async () => { root?.render(<List rows={[make('s1'), make('s3', { checklist: { id: 'c2', title: 'Other' } })]} />); });
    await click(box('pick s1')); await click(box('pick s3'));
    expect(host.textContent).toContain('Select sessions of one checklist.');
    expect([...host.querySelectorAll('button')].some((b) => b.textContent?.includes('Download summary'))).toBe(false);
  });

  it('offers the employee’s other observations of the sheet by date, oldest first', async () => {
    api.list.mockResolvedValue({ items: [make('s3'), make('s2'), make('s1')], total: 3, page: 1, pageSize: 100 });
    await act(async () => { root?.render(<EmployeeObservationsSummary session={make('s2')} t={t} />); });
    expect(api.list).toHaveBeenCalledWith({ status: 'completed', checklistId: 'c1', learnerId: 'l1', pageSize: 100 });
    const boxes = [...host.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(boxes).toHaveLength(3);
    expect(boxes.map((b) => b.checked)).toEqual([false, true, false]);
    expect(host.textContent).toContain('this session');
    await click(boxes[2]!);
    await click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Download summary (CSV)')!);
    expect(api.exportSummary).toHaveBeenCalledWith(['s2', 's3'], 'csv');
  });

  it('shows nothing when the employee has no other observations', async () => {
    api.list.mockResolvedValue({ items: [make('s2')], total: 1, page: 1, pageSize: 100 });
    await act(async () => { root?.render(<EmployeeObservationsSummary session={make('s2')} t={t} />); });
    expect(host.textContent).toBe('');
  });
});
