import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { rolePolicies } from '../auth/roles.js';
import { accessibleAnalyticsSheetIds } from './checklist-sheet-analytics.js';

/**
 * PR 463: acceptance guard for gaps 37-41 of docs/product/future/CHECKLIST_ANALYTICS_TAB_PLAN.md (block 1, the API side).
 * It fails when a later change drops a role from the tab, widens or narrows the sheet access rule, removes a route
 * of the tab, or lets the competitor's name into the repository (the owner calls it "эталон").
 */

const root = resolve(process.cwd(), '../..');
const controller = readFileSync(join(root, 'apps/api/src/modules/checklists/checklists.controller.ts'), 'utf8');

describe('analytics tab: roles and routes (PR 463)', () => {
  it('opens the tab to administrator, manager, instructor and mentor only', () => {
    expect([...rolePolicies.checklistManagerAnalyticsRead].sort()).toEqual(['admin', 'instructor', 'manager', 'mentor']);
  });
  it.each([
    ['checklists/analytics/sheets'],
    ['checklists/analytics/overview'],
    ['checklists/analytics/export'],
    ['checklists/:id/analytics/items'],
  ])('serves %s under the analytics read policy', (path) => {
    const at = controller.indexOf(`@Get('${path}')`);
    expect(at).toBeGreaterThan(-1);
    expect(controller.slice(at, at + 120)).toContain('@Roles(...rolePolicies.checklistManagerAnalyticsRead)');
  });
  it('declares the export before the routes with an :id so "analytics" is never read as an id', () => {
    expect(controller.indexOf("@Get('checklists/analytics/export')")).toBeLessThan(controller.indexOf("@Get('checklists/:id/analytics/items')"));
  });
});

describe('analytics tab: which sheets a role sees (PR 463)', () => {
  const sheets = [
    { id: 'own', createdBy: 'me', folderId: 'closed' },
    { id: 'observed', createdBy: 'other', folderId: 'closed' },
    { id: 'shared', createdBy: 'other', folderId: 'open' },
    { id: 'loose', createdBy: 'other', folderId: null },
    { id: 'foreign-closed', createdBy: 'other', folderId: 'closed' },
  ];
  const folders = [
    { id: 'open', parentId: null, createdBy: 'other', visibleToStaff: true },
    { id: 'closed', parentId: null, createdBy: 'other', visibleToStaff: false },
  ];
  it('shows an administrator every sheet', () => {
    expect(accessibleAnalyticsSheetIds(sheets, folders, { id: 'admin', roles: ['admin'] }, new Set()).size).toBe(sheets.length);
  });
  it.each(['manager', 'instructor', 'mentor'])('shows a %s only their own, observed, shared and folderless sheets', (role) => {
    expect([...accessibleAnalyticsSheetIds(sheets, folders, { id: 'me', roles: [role] }, new Set(['observed']))].sort()).toEqual(['loose', 'observed', 'own', 'shared']);
  });
});

describe('analytics tab: no third-party product name anywhere (PR 463)', () => {
  const word = ['i', 'Spring'].join('').toLowerCase();
  const skip = new Set(['node_modules', 'dist', '.git', 'coverage', 'test-results', 'playwright-report']);
  const text = /\.(ts|tsx|js|mjs|json|md|css|html|yml|yaml|prisma|sql)$/;
  // Directory entries come with their type, and a file is only read (never checked first), so nothing can change in between.
  function walk(dir: string, found: string[]) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, found);
      else if (entry.isFile() && text.test(entry.name) && readFileSync(path, 'utf8').toLowerCase().includes(word)) found.push(path.slice(root.length + 1));
    }
  }
  it('finds it in no source file, text, plan or document', () => {
    const found: string[] = [];
    for (const dir of ['apps', 'packages', 'docs']) walk(join(root, dir), found);
    expect(found).toEqual([]);
  });
});
