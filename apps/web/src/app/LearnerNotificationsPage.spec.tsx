import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactMocks = vi.hoisted(() => ({ useEffect: vi.fn(), useState: vi.fn() }));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useEffect: reactMocks.useEffect, useState: reactMocks.useState };
});

import { LearnerNotificationsPage } from './LearnerNotificationsPage.js';

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
});

function renderWithLoadState(loadState: unknown) {
  let call = 0;
  reactMocks.useState.mockImplementation((initial: unknown) => {
    call += 1;
    return [call === 1 ? loadState : initial, vi.fn()];
  });
  return renderToStaticMarkup(<LearnerNotificationsPage />);
}

describe('LearnerNotificationsPage', () => {
  it('keeps a failed request distinct from an empty inbox and offers retry', () => {
    const html = renderWithLoadState({ status: 'error' });

    expect(html).toContain('role="alert"');
    expect(html).toContain('Не удалось загрузить уведомления');
    expect(html).toContain('Повторить');
    expect(html).not.toContain('Пока нет уведомлений');
  });

  it('renders read and unread history with mark-all action', () => {
    const html = renderWithLoadState({
      status: 'loaded',
      notifications: [
        { id: 'n1', type: 'assessment_passed', data: { assessmentTitle: 'Safety', percentage: 90 }, link: '/learn/assessments/a1', readAt: null, createdAt: '2026-01-01T10:00:00.000Z' },
        { id: 'n2', type: 'assessment_failed', data: { assessmentTitle: 'Fire', percentage: 40 }, link: null, readAt: '2026-01-02T10:00:00.000Z', createdAt: '2026-01-02T10:00:00.000Z' },
      ],
    });

    expect(html).toContain('Safety');
    expect(html).toContain('Fire');
    expect(html).toContain('notification-center__row--unread');
    expect(html).toContain('Отметить все как прочитанные');
  });
});
