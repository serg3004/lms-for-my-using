import { useCallback, useEffect, useState } from 'react';

export type ProtectedImageState = { status: 'idle' | 'loading' | 'error'; url: null } | { status: 'ready'; url: string };

/**
 * PR 400: shows an image that the API serves behind authorization. The page security policy lets
 * images come only from the site itself and `blob:`, so the file is fetched with the session and
 * shown through an object URL, which is released when the image changes or the component goes away.
 * `version` (for example the cover timestamp) makes a replaced picture load again.
 */
export function useProtectedImage(load: (() => Promise<Blob>) | null, version: string | null) {
  const [state, setState] = useState<ProtectedImageState>({ status: 'idle', url: null });
  const [attempt, setAttempt] = useState(0);
  const enabled = load !== null && version !== null;

  useEffect(() => {
    if (!enabled || !load) {
      setState({ status: 'idle', url: null });
      return undefined;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: 'loading', url: null });
    load()
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', url: objectUrl });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error', url: null }); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // `load` is a fresh closure on every render; `version` and `attempt` are the real triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, version, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
