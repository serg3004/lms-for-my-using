import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from './apiClient.js';

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn(),
  useState: vi.fn(),
  useCallback: vi.fn((fn: unknown) => fn),
  useRef: vi.fn((initial: unknown) => ({ current: initial })),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    useEffect: reactMocks.useEffect,
    useState: reactMocks.useState,
    useCallback: reactMocks.useCallback,
    useRef: reactMocks.useRef,
  };
});

import { useAsyncData } from './useAsyncData';

const messages = { unauthenticated: 'Your session expired.', error: 'Unable to load data.' };

type EffectFn = () => void | (() => void);

function setup() {
  const setState = vi.fn();

  reactMocks.useState.mockImplementationOnce((initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, setState]);
  let capturedEffect: EffectFn | undefined;
  reactMocks.useEffect.mockImplementation((effect: EffectFn) => {
    capturedEffect = effect;
  });

  return {
    setState,
    // Mirrors what React does: invoking the effect runs its synchronous portion
    // immediately and returns the cleanup function.
    runEffect: () => capturedEffect?.() as (() => void) | undefined,
  };
}

afterEach(() => {
  reactMocks.useEffect.mockReset();
  reactMocks.useState.mockReset();
  reactMocks.useCallback.mockClear();
  reactMocks.useRef.mockClear();
});

describe('useAsyncData', () => {
  it('starts in the loading state and resolves to loaded on success', async () => {
    const { setState, runEffect } = setup();
    const load = vi.fn().mockResolvedValue({ items: [1, 2] });

    const { state } = useAsyncData(load, [], messages);
    expect(state).toEqual({ status: 'loading' });

    runEffect();
    expect(load).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledWith({ status: 'loading' });

    await Promise.resolve();
    await Promise.resolve();

    expect(setState).toHaveBeenLastCalledWith({ status: 'loaded', data: { items: [1, 2] } });
  });

  it('maps a 401 rejection to the unauthenticated state', async () => {
    const { setState, runEffect } = setup();
    const load = vi.fn().mockRejectedValue(new ApiClientError('Unauthorized', 401));

    useAsyncData(load, [], messages);
    runEffect();
    await Promise.resolve();
    await Promise.resolve();

    expect(setState).toHaveBeenLastCalledWith({ status: 'unauthenticated', message: messages.unauthenticated });
  });

  it('maps any other rejection to the generic error state', async () => {
    const { setState, runEffect } = setup();
    const load = vi.fn().mockRejectedValue(new Error('network down'));

    useAsyncData(load, [], messages);
    runEffect();
    await Promise.resolve();
    await Promise.resolve();

    expect(setState).toHaveBeenLastCalledWith({ status: 'error', message: messages.error });
  });

  it('discards a stale response once the effect has been cancelled', async () => {
    const { setState, runEffect } = setup();
    let resolveLoad!: (value: { items: number[] }) => void;
    const load = vi.fn().mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));

    useAsyncData(load, [], messages);
    const cleanup = runEffect();
    cleanup?.();
    resolveLoad({ items: [1] });
    await Promise.resolve();
    await Promise.resolve();

    expect(setState).not.toHaveBeenCalledWith({ status: 'loaded', data: { items: [1] } });
  });

  it('reload() re-runs the loader and resolves once the new state is applied', async () => {
    const { setState } = setup();
    const load = vi.fn().mockResolvedValueOnce({ items: [1] }).mockResolvedValueOnce({ items: [2] });

    const { reload } = useAsyncData(load, [], messages);
    await reload();

    expect(load).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenLastCalledWith({ status: 'loaded', data: { items: [1] } });

    await reload();
    expect(load).toHaveBeenCalledTimes(2);
    expect(setState).toHaveBeenLastCalledWith({ status: 'loaded', data: { items: [2] } });
  });

  it('mutate() patches already-loaded data without touching other statuses', () => {
    const { setState } = setup();
    const load = vi.fn().mockResolvedValue({ items: [1] });

    const { mutate } = useAsyncData<{ items: number[] }>(load, [], messages);
    mutate((data) => ({ items: [...data.items, 2] }));

    const updater = setState.mock.calls[setState.mock.calls.length - 1][0] as (
      current: { status: string; data?: { items: number[] } },
    ) => unknown;

    expect(updater({ status: 'loaded', data: { items: [1] } })).toEqual({ status: 'loaded', data: { items: [1, 2] } });
    expect(updater({ status: 'loading' })).toEqual({ status: 'loading' });
  });
});
