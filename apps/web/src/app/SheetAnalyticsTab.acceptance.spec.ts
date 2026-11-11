import { describe, expect, it } from 'vitest';

import en from '../i18n/locales/en/common.json';
import kk from '../i18n/locales/kk/common.json';
import ru from '../i18n/locales/ru/common.json';
import zh from '../i18n/locales/zh/common.json';

/**
 * PR 463: acceptance guard for gaps 37-41 of docs/product/future/CHECKLIST_ANALYTICS_TAB_PLAN.md (block 1, the screen side):
 * every role with rights on sheets has the tab, the bulk bar has the button, the metrics of the plan are on the screen
 * and in the four languages, and the export is offered in both formats.
 */

// The sources of the screens as text (Vite `?raw`), read by path relative to `src/`.
const sources = import.meta.glob(
  ['./*.tsx', './routes/*.tsx', '../shared/adminPage.tsx', '../shared/api/manager.ts', '../features/admin-checklists/ChecklistBulkBar.tsx'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const read = (path: string) => {
  const text = sources[path.startsWith('app/') ? `./${path.slice(4)}` : `../${path}`];
  if (text === undefined) throw new Error(`${path} is not part of the acceptance sources`);
  return text;
};
type Locale = { sheetAnalytics: Record<string, string>; admin: { checklists: Record<string, string> } };
const locales: Record<string, Locale> = { ru, en, kk, zh } as unknown as Record<string, Locale>;
const locale = (lang: string) => locales[lang]!;

describe('analytics tab: every role with rights on sheets has it (PR 463)', () => {
  it.each([
    ['app/routes/AdminRoutes.tsx', '/admin/checklists/sheet-analytics'],
    ['app/routes/InstructorRoutes.tsx', 'checklists/sheet-analytics'],
    ['app/routes/MentorRoutes.tsx', 'sheet-analytics'],
    ['app/routes/ManagerRoutes.tsx', 'checklists/sheets'],
  ])('%s routes %s', (file, path) => {
    expect(read(file)).toContain(`path="${path}"`);
  });
  it('lists the tab in the strips of the administrator and of the observer roles', () => {
    expect(read('shared/adminPage.tsx')).toContain('/admin/checklists/sheet-analytics');
    expect(read('app/ObserverSessionsNav.tsx')).toContain("key: 'sheetAnalytics'");
    expect(read('app/ManagerViewSwitch.tsx')).toContain('/manager/checklists/sheets');
  });
  it('puts the button "Аналитика" in the bar of selected checklists', () => {
    expect(read('features/admin-checklists/ChecklistBulkBar.tsx')).toContain("t('admin.checklists.analytics'");
    expect(read('app/AdminChecklistsPage.tsx')).toContain('onAnalytics=');
  });
});

describe('analytics tab: metrics of the plan are shown and translated (PR 463)', () => {
  const keys = ['completion', 'average', 'answered', 'remaining', 'planned', 'fact', 'overdue', 'queue', 'levelsTitle', 'cutCriteria', 'cutGroups', 'cutFeedback', 'cutNotes', 'exportCsv', 'exportXlsx', 'exportError', 'exportEmpty'];
  it.each(['ru', 'en', 'kk', 'zh'])('has every key in %s', (lang) => {
    const block = locale(lang).sheetAnalytics;
    for (const key of keys) expect(block[key], `${lang}: sheetAnalytics.${key}`).toBeTruthy();
    expect(locale(lang).admin.checklists.analytics, `${lang}: admin.checklists.analytics`).toBeTruthy();
  });
  it('reads the metrics from the API contract', () => {
    const api = read('shared/api/manager.ts');
    for (const field of ['plan:', 'completionPercentage', 'averagePercentage', 'criteria:', 'scales:', 'queue:']) expect(api).toContain(field);
    expect(api).toContain('/checklists/analytics/export');
  });
  it('offers the export in CSV and Excel in the overview and in the cuts of one sheet', () => {
    expect(read('app/SheetAnalyticsPage.tsx')).toContain('<SheetAnalyticsExport');
    expect(read('app/SheetItemAnalytics.tsx')).toContain('<SheetAnalyticsExport');
    expect(read('app/SheetAnalyticsExport.tsx')).toContain("['csv', 'xlsx']");
  });
});
