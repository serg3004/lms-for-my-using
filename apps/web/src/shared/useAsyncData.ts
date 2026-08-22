import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { toAsyncDataErrorState, toLoadedState, toLoadingState, type AsyncDataMessages, type AsyncDataState } from './asyncData.js';

export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  messages: AsyncDataMessages,
): { state: AsyncDataState<T>; reload: () => Promise<void> } {
  const [state, setState] = useState<AsyncDataState<T>>(toLoadingState());
  const cancelPrevious = useRef<() => void>(() => {});

  const run = useCallback(async () => {
    cancelPrevious.current();
    let cancelled = false;
    cancelPrevious.current = () => {
      cancelled = true;
    };

    setState(toLoadingState());
    try {
      const data = await load();
      if (!cancelled) setState(toLoadedState(data));
    } catch (error) {
      if (!cancelled) setState(toAsyncDataErrorState(error, messages));
    }
    // deps is caller-controlled, mirroring the existing useAdminUsers.ts convention.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
    return () => cancelPrevious.current();
  }, [run]);

  return { state, reload: run };
}
