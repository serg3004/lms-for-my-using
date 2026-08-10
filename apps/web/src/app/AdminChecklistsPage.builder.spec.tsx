// Renders ChecklistBuilder with real React hooks (no useState/useEffect mocking) so its
// internal state — including the preview panel and assigned-users list, which only mount once
// interior state is set a certain way — gets exercised without fragile positional hook overrides.
import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../shared/api/checklists.js', () => ({
  listInstancesForChecklist: vi.fn().mockResolvedValue([]),
}));

vi.mock('../shared/api/users.js', () => ({
  listUsers: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 200, total: 0 }),
}));

import { ChecklistBuilder } from './AdminChecklistsPage';

const checklist = {
  id: 'checklist-1',
  organizationId: 'org-1',
  title: 'Аттестация кассира',
  description: 'Проверка стандарта обслуживания',
  status: 'draft' as const,
  scoringMode: 'scale' as const,
  passThreshold: 60,
  scaleLevels: [
    { level: 1, label: 'Очень плохо', points: 0 },
    { level: 5, label: 'Отлично', points: 100 },
  ],
  requiresReview: true,
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  items: [
    { id: 'item-1', checklistId: 'checklist-1', order: 0, text: 'Работа с кассой', points: 0, isRequired: true, photoRequired: true },
  ],
};

const statusLabels = { draft: 'Черновик', published: 'Опубликован', archived: 'В архиве' };
const scoringModeLabels = { sum_points: 'Сумма баллов', all_required: 'Все пункты обязательны', scale: 'Своя шкала' };

describe('ChecklistBuilder (real hooks)', () => {
  it('renders the scale-mode scoring config, items and assignment section without crashing', () => {
    const html = renderToStaticMarkup(
      <ChecklistBuilder
        checklist={checklist}
        statusLabels={statusLabels}
        scoringModeLabels={scoringModeLabels}
        onBack={() => {}}
        onReload={async () => {}}
        t={((key: string, fallback?: string) => fallback ?? key) as never}
      />,
    );

    expect(html).toContain('Работа с кассой');
    expect(html).toContain('Очень плохо');
    expect(html).toContain('Отлично');
    expect(html).toContain('Photo required');
    expect(html).toContain('Select an employee');
  });
});
