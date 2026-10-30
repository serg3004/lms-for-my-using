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
  it('renders required/photo item controls and scale config without crashing', () => {
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
    expect(html).not.toContain('Select an employee');
    // PR 296 observation-sheet builder: context fields, item groups, ungrouped bucket, scale manager.
    expect(html).toContain('Номер магазина');
    expect(html).toContain('Приветствие');
    expect(html).toContain('Ungrouped');
    expect(html).toContain('Evaluation scales');
    // PR 317: each group is its own card, criteria render as a table row (not the old flex row
    // whose text input could collapse to 0px -- see admin.css's `.admin-checklist-item input`
    // comment), with per-row order arrows and a row menu instead of an inline delete button.
    expect(html).toContain('admin-group-card');
    expect(html).toContain('admin-criteria-row__text');
    expect(html).toContain('Move up');
    expect(html).toContain('Move down');
  });
});

describe('ChecklistBuilder without criteria', () => {
  const render = (items: typeof checklist.items) => renderToStaticMarkup(
    <ChecklistBuilder
      checklist={{ ...checklist, items }}
      statusLabels={statusLabels}
      scoringModeLabels={scoringModeLabels}
      onBack={() => {}}
      onReload={async () => {}}
      t={((key: string, fallback?: string) => fallback ?? key) as never}
    />,
  );

  it('explains why Preview and Publish are unavailable and links the hint to both buttons', () => {
    const html = render([]);
    expect(html).toContain('id="checklist-needs-items"');
    expect(html).toContain('Preview and Publish become available after you add at least one criterion.');
    expect(html.match(/aria-describedby="checklist-needs-items"/g)).toHaveLength(2);
  });

  it('hides the hint once a criterion exists', () => {
    const html = render(checklist.items);
    expect(html).not.toContain('id="checklist-needs-items"');
  });
});

describe('ChecklistBuilder criteria editor (PR 339)', () => {
  const render = (overrides: Partial<typeof checklist>) => renderToStaticMarkup(
    <ChecklistBuilder
      checklist={{ ...checklist, ...overrides }}
      statusLabels={statusLabels}
      scoringModeLabels={scoringModeLabels}
      onBack={() => {}}
      onReload={async () => {}}
      t={((key: string, fallback?: string, options?: Record<string, string>) => (fallback ?? key).replace('{{name}}', options?.['name'] ?? '')) as never}
    />,
  );

  it('offers a single way to add a criterion: the button in the group, no separate text row', () => {
    const html = render({});
    expect(html).not.toContain('New item text');
    expect(html).not.toContain('Add item');
    expect(html).toContain('Criterion');
  });

  it('does not show the "Ungrouped" caption while groups are not used', () => {
    const html = render({ itemGroups: [], items: checklist.items.map((item) => ({ ...item, groupId: null })) });
    expect(html).not.toContain('Ungrouped');
  });

  it('keeps a button to add the first criterion on an empty checklist without groups', () => {
    const html = render({ itemGroups: [], items: [] });
    expect(html).toContain('+ Criterion');
  });

  it('labels the general-information field controls visibly and moves delete into a menu', () => {
    const html = render({});
    expect(html).toContain('<span>Field label</span>');
    expect(html).toContain('<span>Field type</span>');
    expect(html).toContain('Номер магазина');
    expect(html).toContain('Field actions: Номер магазина');
  });

  it('names the criterion and group in the reorder buttons', () => {
    const html = render({});
    expect(html).toContain('aria-label="Move down: Работа с кассой"');
    expect(html).toContain('aria-label="Move up: Без группы"');
  });
});

describe('ChecklistBuilder settings column (PR 340)', () => {
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

  it('no longer carries the assignment block; assignment lives in Sessions', () => {
    expect(html).not.toContain('Assignment');
    expect(html).not.toContain('checklist-assign-user');
    expect(html).not.toContain('planned next');
  });

  it('keeps secondary settings in a collapsed "Additional settings" section', () => {
    expect(html).toContain('<details><summary>Additional settings</summary>');
    const advanced = html.slice(html.indexOf('<details>'), html.indexOf('</details>'));
    expect(advanced).toContain('Require an instructor to confirm');
    expect(advanced).toContain('Employee sees before the session');
    expect(advanced).not.toContain('Photos only from the camera');
    expect(advanced).not.toContain('Location requirement');
  });

  it('keeps the four sheet flags in a Settings block above the criteria (PR 368)', () => {
    const settings = html.slice(html.indexOf('id="checklist-settings-title"'), html.indexOf('<details>'));
    expect(settings).toContain('Add a “Skip” answer option');
    expect(settings).toContain('Photos only from the camera, not from the gallery');
    expect(settings).toContain('Record location at the start and end of the observation');
    expect(settings).toContain('Add a “Feedback” section');
    expect(settings).toContain('Feedback is required');
    expect(html).toContain('id="checklist-feedback-title"');
  });

  it('explains the active scoring mode and shows the save status', () => {
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('A criterion can also use its own ready-made scale');
    expect(html).toContain('<p role="status" class="admin-form__hint">All changes are saved.</p>');
  });
});

