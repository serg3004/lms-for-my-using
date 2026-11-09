// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { LearnerChecklistFilters, learnerRowTab, matchesSearch, tabFromHash } from './LearnerChecklistFilters.js';
import type { LearnerListTab } from './LearnerChecklistFilters.js';

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(async () => { root?.unmount(); }); root = undefined; document.body.innerHTML = ''; });

describe('learner list split (PR 450)', () => {
  it('puts unfinished attempts and unstarted free sheets into «Assigned», finished, reviewed and expired into «Completed»', () => {
    expect(learnerRowTab({})).toBe('assigned');
    for (const status of ['assigned', 'in_progress'] as const) expect(learnerRowTab({ instance: { status } })).toBe('assigned');
    for (const status of ['completed', 'submitted', 'expired'] as const) expect(learnerRowTab({ instance: { status } })).toBe('completed');
  });

  it('reads the tab from the address and defaults to «Assigned»', () => {
    expect(tabFromHash('#completed')).toBe('completed');
    expect(tabFromHash('')).toBe('assigned');
    expect(tabFromHash('#other')).toBe('assigned');
  });

  it('searches the title without case and markup', () => {
    expect(matchesSearch('<p>Открытие <strong>смены</strong></p>', 'СМЕН')).toBe(true);
    expect(matchesSearch('Касса', '  ')).toBe(true);
    expect(matchesSearch('Касса', 'витрина')).toBe(false);
  });
});

describe('LearnerChecklistFilters', () => {
  async function render() {
    await i18n.changeLanguage('ru');
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const seen: { tab: LearnerListTab; query: string } = { tab: 'assigned', query: '' };
    function Harness() {
      const [tab, setTab] = useState<LearnerListTab>('assigned');
      const [query, setQuery] = useState('');
      seen.tab = tab; seen.query = query;
      return <LearnerChecklistFilters tab={tab} counts={{ assigned: 3, completed: 1 }} query={query} onTab={setTab} onQuery={setQuery} t={i18n.t.bind(i18n) as never} />;
    }
    await act(async () => { root?.render(<Harness />); });
    return { host, seen };
  }

  it('shows both tabs with counters, switches them by click and by arrow keys', async () => {
    const { host, seen } = await render();
    const tabs = [...host.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Назначенные (3)', 'Завершённые (1)']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    await act(async () => { tabs[1]!.click(); });
    expect(seen.tab).toBe('completed');
    await act(async () => { tabs[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(seen.tab).toBe('assigned');
  });

  it('has a search field that reports what is typed', async () => {
    const { host, seen } = await render();
    const input = host.querySelector('input[type="search"]') as HTMLInputElement;
    expect(input.placeholder).toBe('Поиск…');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'касса');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(seen.query).toBe('касса');
  });
});
