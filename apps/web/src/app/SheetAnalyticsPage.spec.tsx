import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { SheetAnalyticsScale, SheetAnalyticsSheet } from '../shared/api/manager.js';
import { ManagerViewSwitch } from './ManagerViewSwitch.js';
import { filterSheets, parseSelectedSheets, ScaleLevelBars, toggleSheet } from './SheetAnalyticsPage.js';

const t = ((key: string, fallback?: string) => fallback ?? key) as unknown as TFunction;
const tt = t as unknown as (key: string, fallback: string) => string;

describe('sheet selection in the address bar (PR 461)', () => {
  it('reads a comma-separated list, trims, lowercases and drops duplicates and blanks', () => {
    expect(parseSelectedSheets(null)).toEqual([]);
    expect(parseSelectedSheets('')).toEqual([]);
    expect(parseSelectedSheets(' AAA, bbb ,,aaa')).toEqual(['aaa', 'bbb']);
  });

  it('starts from "all" when the first sheet is switched off and returns to "all" once every sheet is picked again', () => {
    const all = ['a', 'b', 'c'];
    const withoutB = toggleSheet([], 'b', all);
    expect(withoutB).toEqual(['a', 'c']);
    expect(toggleSheet(withoutB, 'b', all)).toEqual([]);
    expect(toggleSheet(['a'], 'c', all)).toEqual(['a', 'c']);
    expect(toggleSheet(['a', 'c'], 'a', all)).toEqual(['c']);
  });

  it('filters sheets by title without case and ignores markup in titles', () => {
    const sheets: SheetAnalyticsSheet[] = [
      { id: '1', title: 'Охрана труда', status: 'published', folderId: null, sessionsInPeriod: 3 },
      { id: '2', title: '<p>Складская <strong>приёмка</strong></p>', status: 'published', folderId: null, sessionsInPeriod: 0 },
    ];
    expect(filterSheets(sheets, 'ОХРАНА').map((sheet) => sheet.id)).toEqual(['1']);
    expect(filterSheets(sheets, 'приёмка').map((sheet) => sheet.id)).toEqual(['2']);
    expect(filterSheets(sheets, '  ')).toHaveLength(2);
  });
});

describe('ScaleLevelBars (PR 461)', () => {
  it('names the levels and takes the colours from the scale itself, whatever they are called', () => {
    const scale: SheetAnalyticsScale = { scaleKey: 'scale:1', kind: 'scale', name: 'Освоение', levels: [
      { value: 1, label: 'Не знает', labelKey: null, color: '#aa0000', count: 1 }, { value: 2, label: 'Знает', labelKey: null, color: null, count: 3 },
    ] };
    const html = renderToStaticMarkup(<ScaleLevelBars scale={scale} t={tt} />);
    expect(html).toContain('Освоение');
    expect(html).toContain('Не знает');
    expect(html).toContain('1 · 25%');
    expect(html).toContain('3 · 75%');
    expect(html).toContain('#aa0000');
    expect(html).not.toContain('Нет');
  });

  it('shows the yes/no block with translated labels and no fixed "No" for other scales', () => {
    const scale: SheetAnalyticsScale = { scaleKey: 'yes_no', kind: 'yes_no', name: null, levels: [
      { value: 0, label: null, labelKey: 'no', color: null, count: 1 }, { value: 1, label: null, labelKey: 'yes', color: null, count: 1 },
    ] };
    const html = renderToStaticMarkup(<ScaleLevelBars scale={scale} t={tt} />);
    expect(html).toContain('Yes / No criteria');
    expect(html).toContain('>No<');
    expect(html).toContain('>Yes<');
  });
});

describe('ManagerViewSwitch (PR 461)', () => {
  it('links employees and checklists and marks the current view', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ManagerViewSwitch current="sheets" /></MemoryRouter>);
    expect(html).toContain('href="/manager/checklists"');
    expect(html).toContain('href="/manager/checklists/sheets"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.indexOf('aria-current="page"')).toBeGreaterThan(html.indexOf('href="/manager/checklists/sheets"') - 80);
  });
});
