// @vitest-environment jsdom
import '../i18n/index.js';
import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManagerChecklistsPage } from './ManagerChecklistsPage.js';

const mocks = vi.hoisted(() => ({ get: vi.fn(), managers: vi.fn(), employees: vi.fn(), csv: vi.fn(), xlsx: vi.fn() }));
vi.mock('../shared/api/manager.js', () => ({ getManagerChecklistAnalytics: mocks.get, exportManagerChecklistManagers: mocks.managers, exportManagerChecklistEmployees: mocks.employees }));
vi.mock('../shared/api/checklists.js', () => ({ listChecklists: async () => [] }));
vi.mock('../shared/api/checklistSessions.js', () => ({ listChecklistSessions: async () => ({ items: [] }) }));
vi.mock('../shared/downloadCsv.js', () => ({ downloadCsvFile: mocks.csv, downloadXlsxFile: mocks.xlsx }));
vi.mock('../shared/managerLayout.js', () => ({ ManagerPageLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('../features/admin-checklist-sessions/ChecklistSessionWizard.js', () => ({ ChecklistSessionWizard: () => null }));
vi.mock('../features/admin-checklist-sessions/MessageParticipantDialog.js', () => ({ MessageParticipantDialog: () => null }));
const managerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const managers = [
  { managerId, name: 'Leader One', employeesCount: 2, completedCount: 3, averagePercentage: 80 },
  { managerId: null, name: null, employeesCount: 1, completedCount: 0, averagePercentage: null },
];
const fixture = {
  summary: { totalEmployees: 3, totalSessions: 3, completedSessions: 3, averagePercentage: 80, lowCount: 0, highCount: 0, noCompletionCount: 1 },
  thresholds: { low: 60, high: 90 }, distribution: [], trend: [], employees: [], departments: [], departmentOptions: [],
  managers, managerOptions: [{ id: managerId, name: 'Leader One' }],
};
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(async () => {
  await i18n.changeLanguage('ru');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  mocks.get.mockImplementation(async (query) => ({ ...fixture, managers: query.managerId ? managers.filter((row) => (row.managerId ?? 'unassigned') === query.managerId) : managers }));
  mocks.managers.mockResolvedValue({ filename: 'managers.csv', csv: 'csv', rows: [['Руководитель'], ['Leader One']], rowCount: 1 });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function Location() { return <output data-url>{useLocation().search}</output>; }
async function render(search = '?period=custom&from=2026-01-01&to=2026-01-31') {
  await act(async () => root.render(<MemoryRouter initialEntries={[`/manager/checklists${search}`]}><ManagerChecklistsPage /><Location /></MemoryRouter>));
}
async function select(value: string) {
  const control = [...host.querySelectorAll('select')].find((node) => node.parentElement?.textContent?.startsWith('Руководитель'))!;
  expect(control).toBeDefined(); await act(async () => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); });
}
const table = () => host.querySelector('section[aria-labelledby="manager-checklists-managers"]')!;
it('renders the manager table with localized unassigned and empty scores', async () => {
  await render(); expect(table().textContent).toContain('Leader One'); expect(table().textContent).toContain('Без руководителя');
  expect(table().textContent).toContain('—'); expect(table().textContent).not.toMatch(/null|undefined/);
});
it('restores a manager from the URL and preserves the period when switching to unassigned', async () => {
  await render(`?period=custom&from=2026-01-01&to=2026-01-31&managerId=${managerId}`);
  expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ managerId }));
  await select('unassigned');
  expect(host.querySelector('[data-url]')!.textContent).toContain('managerId=unassigned');
  expect(host.querySelector('[data-url]')!.textContent).toContain('from=2026-01-01');
  expect(table().textContent).not.toContain('Leader One'); expect(table().textContent).toContain('Без руководителя');
});
it('exports only the manager table and forwards its domain filters to CSV and Excel', async () => {
  await render(); await select(managerId);
  const buttons = [...table().querySelectorAll('button')].filter((node) => node.getAttribute('aria-label')?.includes('По руководителям'));
  expect(buttons).toHaveLength(2);
  await act(async () => buttons[0].click());
  expect(mocks.managers).toHaveBeenLastCalledWith(expect.objectContaining({ managerId, format: 'csv' }));
  expect(mocks.csv).toHaveBeenCalledWith('managers.csv', 'csv');
  await act(async () => buttons[1].click());
  expect(mocks.managers).toHaveBeenLastCalledWith(expect.objectContaining({ managerId, format: 'xlsx' }));
  expect(mocks.xlsx).toHaveBeenCalledWith('managers.csv', [['Руководитель'], ['Leader One']], 'По руководителям');
  expect(mocks.employees).not.toHaveBeenCalled();
});
it('shows a safe unavailable label when a bookmarked manager leaves the scope', async () => {
  await render('?managerId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  expect(host.textContent).toContain('Руководитель недоступен'); expect(table().textContent).not.toContain('bbbbbbbb-bbbb');
});
