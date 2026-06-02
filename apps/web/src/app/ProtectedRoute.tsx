import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { getCurrentUser } from '../shared/api/auth.js';
import { ApiClientError } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/api/types.js';
import { LogoutButton } from './LogoutButton.js';

type ProtectedRouteProps = {
  children: ReactNode;
  protectedPathPrefixes: string[];
  canAccess?: (user: CurrentUser) => boolean;
};

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden';

export function getProtectedRouteAuthState(user: CurrentUser, canAccess?: (user: CurrentUser) => boolean): AuthState {
  return canAccess && !canAccess(user) ? 'forbidden' : 'authenticated';
}

export function getProtectedRouteErrorState(error: unknown): AuthState {
  if (error instanceof ApiClientError && error.status === 401) {
    return 'unauthenticated';
  }

  return 'unauthenticated';
}

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

        setAuthState(getProtectedRouteAuthState(user, canAccess));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setAuthState(getProtectedRouteErrorState(error));
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

  return (
    <>
      <LogoutButton />
      {children}
    </>
  );
}
