import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactMocks = vi.hoisted(() => ({ useState: vi.fn() }));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useState: reactMocks.useState };
});

import { NotificationBell } from './learnerLayout.js';

afterEach(() => {
  reactMocks.useState.mockReset();
});

describe('NotificationBell', () => {
  it('renders closed with no unread badge before the count has loaded', () => {
    reactMocks.useState.mockImplementation((initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      vi.fn(),
    ]);

    const html = renderToStaticMarkup(<NotificationBell />);

    expect(html).toContain('notification-bell__btn');
    expect(html).not.toContain('notification-bell__badge');
    expect(html).not.toContain('notification-bell__menu');
  });

  it('renders the open menu with an unread notification and a mark-all-read action', () => {
    const states: unknown[] = [
      false, // open
      2, // unreadCount
      [
        { id: 'n1', type: 'assessment_passed', data: { assessmentTitle: 'Safety Basics', percentage: 90 }, link: '/learn/assessments/a1', readAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'n2', type: 'assessment_failed', data: { assessmentTitle: 'Fire Drill', percentage: 40 }, link: null, readAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
      ], // notifications
    ];
    let callIndex = 0;
    reactMocks.useState.mockImplementation((initial: unknown) => {
      if (callIndex === 0) {
        callIndex += 1;
        return [true, vi.fn()]; // force `open`
      }
      const value = states[callIndex] ?? initial;
      callIndex += 1;
      return [value, vi.fn()];
    });

    const html = renderToStaticMarkup(<NotificationBell />);

    expect(html).toContain('notification-bell__menu');
    expect(html).toContain('Safety Basics');
    expect(html).toContain('notification-bell__item--unread');
  });
});
