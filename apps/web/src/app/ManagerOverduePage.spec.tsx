import '../i18n/index.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactMocks = vi.hoisted(() => ({ useEffect: vi.fn(), useState: vi.fn() }));
vi.mock('react', async () => ({ ...(await vi.importActual<typeof import('react')>('react')), ...reactMocks }));
import { ManagerOverduePage } from './ManagerOverduePage';

afterEach(() => { reactMocks.useEffect.mockReset(); reactMocks.useState.mockReset(); });

describe('ManagerOverduePage', () => {
  it('renders overdue assignments returned by the manager API', () => {
    reactMocks.useState.mockReturnValueOnce([{ status: 'loaded', summary: {
      membersCount: 1, completionRate: 50, dueThisWeekCount: 0, overdueCount: 1, avgTeamScore: null, upcomingDeadlines: [],
      overdueAssignments: [{ assignmentId: 'a1', userId: 'u1', courseTitle: 'Safety', dueAt: '2026-08-20T00:00:00.000Z' }],
      members: [{ userId: 'u1', firstName: 'Alex', lastName: 'Smith', email: 'a@example.com', activeCoursesCount: 1, completionPercent: 50, status: 'risk' }],
    } }, vi.fn()]).mockImplementation((initial: unknown) => [initial, vi.fn()]);
    const html = renderToStaticMarkup(<ManagerOverduePage />);
    expect(html).toContain('Alex Smith'); expect(html).toContain('Safety'); expect(html).toContain('Просрочено');
  });

  it('renders an empty state', () => {
    reactMocks.useState.mockReturnValueOnce([{ status: 'loaded', summary: {
      membersCount: 0, completionRate: 0, dueThisWeekCount: 0, overdueCount: 0, avgTeamScore: null,
      upcomingDeadlines: [], overdueAssignments: [], members: [],
    } }, vi.fn()]).mockImplementation((initial: unknown) => [initial, vi.fn()]);
    expect(renderToStaticMarkup(<ManagerOverduePage />)).toContain('Просроченных назначений нет.');
  });
});
