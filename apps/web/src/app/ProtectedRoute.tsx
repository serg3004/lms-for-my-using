import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { ApiClientError, getCurrentUser, type CurrentUser } from '../shared/apiClient.js';

type ProtectedRouteProps = {
  children: ReactNode;
  protectedPathPrefixes: string[];
  canAccess?: (user: CurrentUser) => boolean;
};

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden';

export function ProtectedRoute({ children, protectedPathPrefixes, canAccess }: ProtectedRouteProps) {
  const location = useLocation();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const isProtectedPath = protectedPathPrefixes.some((pathPrefix) => location.pathname.startsWith(pathPrefix));

  useEffect(() => {
    if (!isProtectedPath) {
      return;
    }

    let isMounted = true;

    async function checkCurrentUser() {
      setAuthState('loading');

      try {
        const user = await getCurrentUser();

        if (!isMounted) {
          return;
        }

        setAuthState(canAccess && !canAccess(user) ? 'forbidden' : 'authenticated');
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setAuthState('unauthenticated');
          return;
        }

        setAuthState('unauthenticated');
      }
    }

    void checkCurrentUser();

    return () => {
      isMounted = false;
    };
  }, [canAccess, isProtectedPath, location.pathname]);

  if (!isProtectedPath) {
    return <>{children}</>;
  }

  if (authState === 'loading') {
    return (
      <main>
        <p role="status">Loading...</p>
      </main>
    );
  }

  if (authState === 'unauthenticated') {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  if (authState === 'forbidden') {
    return (
      <main>
        <h1>Forbidden</h1>
        <p>You do not have access to this page.</p>
      </main>
    );
  }

  return <>{children}</>;
}
