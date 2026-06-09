import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadedState = {
  status: 'loaded',
  certificate: {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organizationId: '223e4567-e89b-12d3-a456-426614174000',
    courseId: '323e4567-e89b-12d3-a456-426614174000',
    userId: '423e4567-e89b-12d3-a456-426614174000',
    assessmentAttemptId: null,
    status: 'issued',
    issuedAt: '2026-01-01T00:00:00.000Z',
    revokedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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

import { LearnerCertificateDetailPage } from './LearnerCertificateDetailPage';

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
});

describe('LearnerCertificateDetailPage', () => {
  it('does not render certificate, organization, course, or user ids as learner-facing labels', () => {
    reactMocks.useState.mockImplementation((initialState: unknown) => [
      typeof initialState === 'object' && initialState !== null && 'status' in initialState ? loadedState : initialState,
      vi.fn(),
    ]);

    const html = renderToStaticMarkup(
      <LearnerCertificateDetailPage certificateId="123e4567-e89b-12d3-a456-426614174000" />,
    );

    expect(html).toContain('Organization');
    expect(html).toContain('Course');
    expect(html).not.toContain('123e4567-e89b-12d3-a456-426614174000');
    expect(html).not.toContain('223e4567-e89b-12d3-a456-426614174000');
    expect(html).not.toContain('323e4567-e89b-12d3-a456-426614174000');
    expect(html).not.toContain('423e4567-e89b-12d3-a456-426614174000');
    expect(html).not.toContain('#123E4567');
  });
});
