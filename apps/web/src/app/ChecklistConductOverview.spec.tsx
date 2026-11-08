// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistItemGroup, ChecklistItemSummary } from '../shared/api/types.js';
import { ChecklistConductOverview } from './ChecklistConductOverview';
import type { ConductCriterion } from './checklistConductOverview.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

const criterion = (n: number, groupId: string | null): ConductCriterion => ({ item: { id: `i${n}`, order: n, text: `Критерий ${n}`, groupId } as unknown as ChecklistItemSummary, index: n - 1, state: 'unanswered' });
async function render(criteria: ConductCriterion[], groups: ChecklistItemGroup[]) {
  await i18n.changeLanguage('ru');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<ChecklistConductOverview criteria={criteria} groups={groups} hideAnswered={false} currentItemIndex={0} disabled={false} onSelect={vi.fn()} t={i18n.t.bind(i18n)} />));
  return [...host.querySelectorAll('h3')].map((h) => h.textContent);
}

describe('conduct overview (PR 447)', () => {
  it('has no «Other criteria» title when the sheet has no groups', async () => {
    expect(await render([criterion(1, null), criterion(2, null)], [])).toEqual([]);
    expect(host?.textContent).toContain('Критерий 2');
  });
  it('keeps the titles when the sheet has groups, including the rest', async () => {
    const titles = await render([criterion(1, 'g1'), criterion(2, null)], [{ id: 'g1', checklistId: 'c', title: 'Безопасность', order: 0 } as unknown as ChecklistItemGroup]);
    expect(titles).toHaveLength(2);
    expect(titles[0]).toContain('Безопасность');
  });
});
