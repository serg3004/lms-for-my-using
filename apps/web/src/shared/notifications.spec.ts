import { describe, expect, it } from 'vitest';

import { describeNotification, markAllReadLocally, markReadLocally } from './notifications.js';
import type { NotificationSummary } from './api/types.js';

const t = ((key: string, options?: Record<string, unknown>) => {
  if (key === 'notifications.types.assessment_passed.title') return 'Test passed';
  if (key === 'notifications.types.assessment_passed.message') return `You passed "${options?.assessmentTitle}" with ${options?.percentage}%.`;
  return (options?.defaultValue as string) ?? key;
}) as never;

describe('describeNotification', () => {
  it('renders the title and message via i18n for a known type', () => {
    const notification: NotificationSummary = {
      id: 'n1',
      type: 'assessment_passed',
      data: { assessmentTitle: 'Safety Basics', percentage: 85 },
      link: '/learn/assessments/a1',
      readAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    expect(describeNotification(notification, t)).toEqual({
      title: 'Test passed',
      message: 'You passed "Safety Basics" with 85%.',
    });
  });

  it('falls back to the raw type when no translation exists', () => {
    const notification: NotificationSummary = {
      id: 'n2',
      type: 'unknown_type',
      data: {},
      link: null,
      readAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    expect(describeNotification(notification, t)).toEqual({
      title: 'unknown_type',
      message: '',
    });
  });
});

const items: NotificationSummary[] = [
  { id: 'n1', type: 'assessment_passed', data: {}, link: null, readAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'n2', type: 'assessment_failed', data: {}, link: null, readAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
];

describe('markReadLocally', () => {
  it('sets readAt only on the matching unread notification', () => {
    const result = markReadLocally(items, 'n1', '2026-02-01T00:00:00.000Z');
    expect(result[0].readAt).toBe('2026-02-01T00:00:00.000Z');
    expect(result[1].readAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('leaves an already-read notification untouched', () => {
    const result = markReadLocally(items, 'n2', '2026-02-01T00:00:00.000Z');
    expect(result[1].readAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('markAllReadLocally', () => {
  it('sets readAt on every unread notification, keeping already-read timestamps', () => {
    const result = markAllReadLocally(items, '2026-02-01T00:00:00.000Z');
    expect(result[0].readAt).toBe('2026-02-01T00:00:00.000Z');
    expect(result[1].readAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
