import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { ForbiddenPage } from './ForbiddenPage.js';
import { ApiClientError } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/api/types.js';
import { SessionProvider, useOptionalSession, useSession } from '../shared/session.js';
import { syncOrganizationTheme } from '../shared/theme.js';

type ProtectedRouteProps = {
  children: ReactNode;
  protectedPathPrefixes: string[];
  canAccess?: (user: CurrentUser) => boolean;
};

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden';

export function isProtectedRoutePath(pathname: string, protectedPathPrefixes: readonly string[]) {
  return protectedPathPrefixes.some((pathPrefix) => pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`));
}

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
  const session = useOptionalSession();
  const isProtectedPath = isProtectedRoutePath(location.pathname, protectedPathPrefixes);

  if (!session) {
    return (
      <SessionProvider authenticated={isProtectedPath}>
        <ProtectedRouteContent canAccess={canAccess} isProtectedPath={isProtectedPath} location={location}>
          {children}
        </ProtectedRouteContent>
      </SessionProvider>
    );
  }

  return <ProtectedRouteContent canAccess={canAccess} isProtectedPath={isProtectedPath} location={location}>{children}</ProtectedRouteContent>;
}

function ProtectedRouteContent({ children, canAccess, isProtectedPath, location }: Pick<ProtectedRouteProps, 'children' | 'canAccess'> & {
  isProtectedPath: boolean;
  location: ReturnType<typeof useLocation>;
}) {
  const { currentUser, error, status } = useSession();

  useEffect(() => {
    if (!isProtectedPath) {
      return;
    }

    if (isProtectedPath && currentUser) void syncOrganizationTheme(currentUser.organizationId);
  }, [currentUser, isProtectedPath]);

  const authState: AuthState = status === 'authenticated' && currentUser
    ? getProtectedRouteAuthState(currentUser, canAccess)
    : status === 'error'
      ? getProtectedRouteErrorState(error)
      : 'loading';

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
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}
