import '../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import { ManagerDashboardPage } from './ManagerDashboardPage';
import { ManagerTeamPage } from './ManagerTeamPage';

function useLoadingState() {
  reactMocks.useState.mockImplementation((initialState: unknown) => [initialState, vi.fn()]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Manager pages smoke tests', () => {
  it('ManagerDashboardPage renders without crashing in loading state', () => {
    useLoadingState();
    expect(() => renderToStaticMarkup(<ManagerDashboardPage />)).not.toThrow();
  });

  it('ManagerTeamPage renders without crashing in loading state', () => {
    useLoadingState();
    expect(() => renderToStaticMarkup(<ManagerTeamPage />)).not.toThrow();
  });
});
