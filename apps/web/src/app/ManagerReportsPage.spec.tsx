import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadedState = {
  status: 'loaded',
  data: {
    membersCount: 2, completionRate: 60, dueThisWeekCount: 1, overdueCount: 1, avgTeamScore: 84,
    upcomingDeadlines: [],
    overdueAssignments: [{ assignmentId: 'a1', courseTitle: 'Safety', userId: 'user-2', groupId: null, groupName: null, dueAt: '2026-08-01' }],
    members: [
      { userId: 'user-1', firstName: 'Alex', lastName: 'Kim', email: 'alex@example.com', activeCoursesCount: 2, completionPercent: 84, status: 'good' },
      { userId: 'user-2', firstName: 'Mira', lastName: 'Lee', email: 'mira@example.com', activeCoursesCount: 1, completionPercent: 36, status: 'risk' },
    ],
  },
};

const reactMocks = vi.hoisted(() => ({ useEffect: vi.fn(), useState: vi.fn() }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useEffect: reactMocks.useEffect, useState: reactMocks.useState };
});

import { ManagerReportsPage } from './ManagerReportsPage.js';

afterEach(() => { reactMocks.useEffect.mockReset(); reactMocks.useState.mockReset(); });

describe('ManagerReportsPage', () => {
  it('renders scoped metrics, filters, and drill-down links', () => {
    reactMocks.useState
      .mockReturnValueOnce(['all', vi.fn()])
      .mockReturnValueOnce(['all', vi.fn()])
      .mockReturnValueOnce([loadedState, vi.fn()])
      .mockImplementation((initial: unknown) => [initial, vi.fn()]);

    const html = renderToStaticMarkup(<MemoryRouter><ManagerReportsPage /></MemoryRouter>);
    expect(html).toContain('Alex Kim');
    expect(html).toContain('Mira Lee');
    expect(html).toContain('60%');
    expect(html).toContain('/manager/overdue');
    expect(html).toContain('/manager/team?member=user-1');
  });
});
