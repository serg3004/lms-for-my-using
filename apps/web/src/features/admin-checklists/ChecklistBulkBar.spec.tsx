import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import type { ChecklistBulkResult, ChecklistSummary } from '../../shared/api/types.js';
import { ChecklistBulkBar, bulkDeleteMessage, bulkResultSummary } from './ChecklistBulkBar.js';

const t = ((key: string, fallbackOrOptions?: string | Record<string, unknown>, options?: Record<string, unknown>) => {
  const fallback = typeof fallbackOrOptions === 'string' ? fallbackOrOptions : key;
  const values = (typeof fallbackOrOptions === 'string' ? options : fallbackOrOptions) ?? {};
  return fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ''));
}) as unknown as TFunction;
const sheet = (id: string, title: string) => ({ id, title }) as ChecklistSummary;

function render(selected: ChecklistSummary[]) {
  return renderToStaticMarkup(<ChecklistBulkBar busy={false} onAction={vi.fn()} onCopy={vi.fn()} onEdit={vi.fn()} selected={selected} t={t} />);
}

describe('ChecklistBulkBar (PR 394)', () => {
  it('enables Edit and Copy only for exactly one selected checklist', () => {
    const one = render([sheet('a', 'A')]);
    expect(one).toMatch(/<button[^>]*>Edit<\/button>/);
    expect(one).not.toMatch(/disabled=""[^>]*>Edit</);
    const two = render([sheet('a', 'A'), sheet('b', 'B')]);
    expect(two).toMatch(/disabled=""[^>]*>Edit</);
    expect(two).toMatch(/disabled=""[^>]*>Copy</);
    expect(two).toContain('>Publish<');
    expect(two).toContain('>Archive<');
    expect(two).toContain('>Delete<');
  });
});

describe('bulk delete confirmation and result (PR 394)', () => {
  it('lists up to ten titles and counts the rest', () => {
    const many = Array.from({ length: 12 }, (_, i) => sheet(`id${i}`, `Sheet ${i}`));
    const message = bulkDeleteMessage(many, t);
    expect(message).toContain('«Sheet 0»');
    expect(message).toContain('«Sheet 9»');
    expect(message).not.toContain('«Sheet 10»');
    expect(message).toContain('and 2 more');
    expect(message).toContain('12');
  });

  it('summarizes done and skipped counts with a reason per skipped checklist', () => {
    const result: ChecklistBulkResult = {
      action: 'delete', done: 1, skipped: 2,
      results: [{ id: 'a', result: 'done' }, { id: 'b', result: 'skipped', reason: 'forbidden' }, { id: 'c', result: 'skipped', reason: 'moved_to_draft' }],
    };
    const summary = bulkResultSummary(result, new Map([['b', 'Closing'], ['c', 'Opening']]), t);
    expect(summary.headline).toBe('Done: 1, skipped: 2');
    expect(summary.skipped).toHaveLength(2);
    expect(summary.skipped[0]?.text).toContain('«Closing»');
    expect(summary.skipped[1]?.text).toContain('moved to drafts');
  });
});
