import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getCurrentUser } from './api/auth.js';
import type { CurrentUser } from './api/types.js';

type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'error';

type SessionContextValue = {
  currentUser: CurrentUser | null;
  error: unknown;
  status: SessionStatus;
  refreshUser: () => Promise<CurrentUser | null>;
  clearSession: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ authenticated, children }: { authenticated: boolean; children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const requestRef = useRef<Promise<CurrentUser | null> | null>(null);

  const refreshUser = useCallback(() => {
    if (requestRef.current) return requestRef.current;

    setStatus('loading');
    setError(null);
    const request = getCurrentUser()
      .then((user) => {
        setCurrentUser(user);
        setStatus('authenticated');
        return user;
      })
      .catch((cause: unknown) => {
        setCurrentUser(null);
        setError(cause);
        setStatus('error');
        return null;
      })
      .finally(() => {
        requestRef.current = null;
      });
    requestRef.current = request;
    return request;
  }, []);

  const clearSession = useCallback(() => {
    setCurrentUser(null);
    setError(null);
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (authenticated && status === 'idle') void refreshUser();
  }, [authenticated, refreshUser, status]);

  const value = useMemo(
    () => ({ currentUser, error, status, refreshUser, clearSession }),
    [clearSession, currentUser, error, refreshUser, status],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used within SessionProvider');
  return session;
}

export function useOptionalSession() {
  return useContext(SessionContext);
}
