import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadedState = {
  status: 'loaded',
  data: {
    summary: {
      membersCount: 2,
      completionRate: 60,
      dueThisWeekCount: 1,
      overdueCount: 1,
      avgTeamScore: 84,
      upcomingDeadlines: [],
      members: [
        { userId: 'user-1', firstName: 'Алексей', lastName: 'Смирнов', email: 'a@demo.com', activeCoursesCount: 2, completionPercent: 84, status: 'good' },
        { userId: 'user-2', firstName: 'Мария', lastName: 'Иванова', email: 'm@demo.com', activeCoursesCount: 3, completionPercent: 46, status: 'risk' },
      ],
    },
  },
};

const emptyState = {
  status: 'loaded',
  data: {
    summary: {
      membersCount: 0,
      completionRate: 0,
      dueThisWeekCount: 0,
      overdueCount: 0,
      avgTeamScore: null,
      upcomingDeadlines: [],
      members: [],
    },
  },
};

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn(),
  useState: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    useEffect: reactMocks.useEffect,
    useState: reactMocks.useState,
  };
});

import { ManagerTeamPage } from './ManagerTeamPage';

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
});

describe('ManagerTeamPage', () => {
  // useState call order in ManagerTeamPage: 1 search, 2 statusFilter, then useAsyncData's
  // internal loadState is call 3.
  it('renders the team table with progress and risk status', () => {
    reactMocks.useState
      .mockReturnValueOnce(['', vi.fn()])
      .mockReturnValueOnce(['all', vi.fn()])
      .mockReturnValueOnce([loadedState, vi.fn()])
      .mockImplementation((initial: unknown) => [initial, vi.fn()]);

    const html = renderToStaticMarkup(<ManagerTeamPage />);

    expect(html).toContain('Алексей Смирнов');
    expect(html).toContain('Мария Иванова');
    expect(html).toContain('84%');
    expect(html).toContain('46%');
    expect(html).toContain('Риск');
    expect(html).toContain('В норме');
  });

  it('renders an empty state when the team has no members', () => {
    reactMocks.useState
      .mockReturnValueOnce(['', vi.fn()])
      .mockReturnValueOnce(['all', vi.fn()])
      .mockReturnValueOnce([emptyState, vi.fn()])
      .mockImplementation((initial: unknown) => [initial, vi.fn()]);

    const html = renderToStaticMarkup(<ManagerTeamPage />);

    expect(html).toContain('Сотрудники не найдены.');
  });
});
