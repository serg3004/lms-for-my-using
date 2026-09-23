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

import { ChecklistBuilder, createDefaultScale } from './AdminChecklistsPage';

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
  contextFields: [{ id: 'field-1', label: 'Номер магазина', type: 'text' as const, required: true, order: 0 }],
  itemGroups: [{ id: 'group-1', checklistId: 'checklist-1', title: 'Приветствие', order: 0 }],
  defaultLocationCapturePolicy: null,
  preSessionVisibility: 'structure_only' as const,
  items: [
    { id: 'item-1', checklistId: 'checklist-1', order: 0, text: 'Работа с кассой', points: 0, isRequired: true, photoRequired: true, groupId: 'group-1' },
    { id: 'item-2', checklistId: 'checklist-1', order: 1, text: 'Без группы', points: 0, isRequired: false, photoRequired: false, groupId: null },
  ],
};

const statusLabels = { draft: 'Черновик', published: 'Опубликован', archived: 'В архиве' };
const scoringModeLabels = { sum_points: 'Сумма баллов', all_required: 'Все пункты обязательны', scale: 'Своя шкала' };

describe('localized checklist defaults', () => {
  it('localizes new scale labels without replacing authored labels', () => {
    const labels: Record<string, string> = { 'admin.checklists.defaultScale.1': 'Very poor', 'admin.checklists.defaultScale.2': 'Poor', 'admin.checklists.defaultScale.3': 'Good', 'admin.checklists.defaultScale.4': 'Very good', 'admin.checklists.defaultScale.5': 'Excellent' };
    expect(createDefaultScale(((key: string) => labels[key]) as never).map((level) => level.label))
      .toEqual(['Very poor', 'Poor', 'Good', 'Very good', 'Excellent']);
  });
});

describe('ChecklistBuilder (real hooks)', () => {
  it('renders required/photo item controls, scale config and assignment section without crashing', () => {
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
    expect(html).toContain('Без группы');
    expect(html).toContain('Очень плохо');
    expect(html).toContain('Отлично');
    expect(html).toContain('Required item');
    expect(html).toContain('Photo required');
    expect(html).toContain('Select an employee');
    // PR 296 observation-sheet builder: context fields, item groups, ungrouped bucket, scale manager.
    expect(html).toContain('Номер магазина');
    expect(html).toContain('Приветствие');
    expect(html).toContain('Ungrouped');
    expect(html).toContain('Evaluation scales');
  });
});
