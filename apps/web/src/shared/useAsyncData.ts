import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { toAsyncDataErrorState, toLoadedState, toLoadingState, type AsyncDataMessages, type AsyncDataState } from './asyncData.js';

export function useAsyncData<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  messages: AsyncDataMessages,
): { state: AsyncDataState<T>; reload: () => Promise<void>; mutate: (updater: (data: T) => T) => void } {
  const [state, setState] = useState<AsyncDataState<T>>(toLoadingState());
  const cancelPrevious = useRef<() => void>(() => {});

  const run = useCallback(async () => {
    cancelPrevious.current();
    const controller = new AbortController();
    cancelPrevious.current = () => {
      controller.abort();
    };

    setState(toLoadingState());
    try {
      const data = await load(controller.signal);
      if (!controller.signal.aborted) setState(toLoadedState(data));
    } catch (error) {
      if (!controller.signal.aborted) setState(toAsyncDataErrorState(error, messages));
    }
    // deps is caller-controlled, mirroring the existing useAdminUsers.ts convention.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
    return () => cancelPrevious.current();
  }, [run]);

  const mutate = useCallback((updater: (data: T) => T) => {
    setState((current) => (current.status === 'loaded' ? toLoadedState(updater(current.data)) : current));
  }, []);

  return { state, reload: run, mutate };
}
