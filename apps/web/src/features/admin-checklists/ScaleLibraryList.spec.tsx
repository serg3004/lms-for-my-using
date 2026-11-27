// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { DEFAULT_LEVEL_COLORS } from '../../shared/levelPaint.js';
import type { ChecklistScaleSummary } from '../../shared/api/types.js';
import { ScaleLibraryList, scaleLevelColor } from './ScaleLibraryList.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; });
const t = ((key: string, options?: Record<string, unknown>) => `${key}${options?.count !== undefined ? `:${options.count}` : ''}`) as unknown as TFunction;

const scale = (id: string, name: string, over: Partial<ChecklistScaleSummary> = {}): ChecklistScaleSummary => ({
  id, organizationId: 'org', name, status: 'active', isDefault: false, inUse: false, usageCount: 2,
  creator: { id: 'u', firstName: 'Anna', lastName: 'Author' }, createdAt: '2026-10-01T10:00:00.000Z',
  levels: [{ value: 0, label: 'No', score: 0 }, { value: 1, label: 'Partly', score: 5 }, { value: 2, label: 'Yes', score: 10, color: '#1565C0' }],
  ...over,
});

async function render(scales: ChecklistScaleSummary[]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(<MemoryRouter><ScaleLibraryList base="/scales" language="en" scales={scales} t={t} timezone="UTC" /></MemoryRouter>); });
  return container;
}
const names = (root: HTMLElement) => Array.from(root.querySelectorAll('.scale-card__name')).map((node) => node.textContent);

describe('scale library list (PR 517)', () => {
  it('paints a level with its own colour, otherwise by the default rule: best green, zero red, between orange', () => {
    const quality = scale('q', 'Quality');
    expect([0, 1, 2].map((index) => scaleLevelColor(quality, index))).toEqual([DEFAULT_LEVEL_COLORS.zero, DEFAULT_LEVEL_COLORS.partial, '#1565C0']);
    const plain = scale('p', 'Plain', { levels: [{ value: 0, label: 'No', score: 0 }, { value: 1, label: 'Yes', score: 1 }] });
    expect([0, 1].map((index) => scaleLevelColor(plain, index))).toEqual([DEFAULT_LEVEL_COLORS.zero, DEFAULT_LEVEL_COLORS.full]);
  });

  it('shows a card per scale with one bar per level, level names, usage and author', async () => {
    const root = await render([scale('q', 'Quality')]);
    expect(root.querySelectorAll('.scale-card__bar')).toHaveLength(3);
    expect(root.querySelector('.scale-card__levels')?.textContent).toBe('NoPartlyYes');
    expect(root.querySelector('.scale-card')?.textContent).toContain('admin.checklists.scaleLibrary.usage:2');
    expect(root.querySelector('.scale-card__meta')?.textContent).toContain('Anna Author');
    expect(root.querySelector('a.scale-card__link')?.getAttribute('href')).toBe('/scales/q');
  });

  it('keeps archived scales on their own tab with a counter, and the search stays inside the tab', async () => {
    const root = await render([scale('a', 'Alpha'), scale('b', 'Beta'), scale('z', 'Zulu archived', { status: 'archived' })]);
    const tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(['admin.checklists.scaleLibrary.tabActive:2', 'admin.checklists.scaleLibrary.tabArchived:1']);
    expect(names(root)).toEqual(['Alpha', 'Beta']);
    await act(async () => { tabs[1]!.click(); });
    expect(names(root)).toEqual(['Zulu archived']);
    expect(root.querySelector('.scale-card--archived')).not.toBeNull();
    const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'alp'); search.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(names(root)).toEqual([]);
  });

  it('flips the order with the sort button', async () => {
    const root = await render([scale('a', 'Alpha'), scale('b', 'Beta')]);
    await act(async () => { root.querySelector<HTMLButtonElement>('.scale-filter__sort')!.click(); });
    expect(names(root)).toEqual(['Beta', 'Alpha']);
  });
});
