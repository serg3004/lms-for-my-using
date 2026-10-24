import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import type { ChecklistStatus, ChecklistSummary } from '../../shared/api/types.js';
import { ChecklistTable } from './ChecklistTable.js';
import { checklistStatusAction } from './domain.js';

const t = ((key: string, fallback?: string) => fallback ?? key) as unknown as TFunction;
const statusLabels = { draft: 'Draft', published: 'Published', archived: 'Archived' };
const scoringModeLabels = { sum_points: 'Sum', all_required: 'All', scale: 'Scale' };

function render(status: ChecklistStatus) {
  const checklist = { id: 'c1', title: 'Opening shift', status, scoringMode: 'sum_points', items: [] } as unknown as ChecklistSummary;
  return renderToStaticMarkup(
    <ChecklistTable
      onCopy={vi.fn()}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
      onStatusChange={vi.fn()}
      rows={[checklist]}
      scoringModeLabels={scoringModeLabels}
      statusLabels={statusLabels}
      t={t}
    />,
  );
}

describe('checklistStatusAction (PR 327)', () => {
  it('publishes a draft, and sends published and archived checklists back to draft (never straight to published)', () => {
    expect(checklistStatusAction('draft')).toBe('published');
    expect(checklistStatusAction('published')).toBe('draft');
    expect(checklistStatusAction('archived')).toBe('draft');
  });
});

describe('ChecklistTable (PR 327)', () => {
  it('shows the status as a badge with an explicit next-step button instead of a dropdown', () => {
    const html = render('draft');
    expect(html).toContain('ds-badge');
    expect(html).toContain('>Draft<');
    expect(html).toContain('>Publish<');
    expect(html).not.toContain('<select');
  });

  it('offers "move to draft" for a published checklist and "restore as draft" for an archived one', () => {
    expect(render('published')).toContain('>Move to draft<');
    expect(render('archived')).toContain('>Restore as draft<');
  });

  it('keeps Edit and Copy as primary actions; Delete and Archive are behind the row menu', () => {
    const html = render('published');
    expect(html).toContain('>Edit<');
    expect(html).toContain('>Copy<');
    // Menu items are only rendered once the menu is open, so Delete must not be a visible button.
    expect(html).not.toContain('>Delete<');
    expect(html).toContain('aria-haspopup');
  });
});
