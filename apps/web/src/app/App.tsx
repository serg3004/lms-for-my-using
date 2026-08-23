import { Suspense, useCallback } from 'react';
import { Routes, useLocation } from 'react-router-dom';

import { canAccessPath, protectedPathPrefixes } from './navigationPolicy.js';
import { ProtectedRoute } from './ProtectedRoute.js';
import { RouteErrorBoundary } from './RouteErrorBoundary.js';
import { AdminRoutes } from './routes/AdminRoutes.js';
import { InstructorRoutes } from './routes/InstructorRoutes.js';
import { LearnerRoutes } from './routes/LearnerRoutes.js';
import { ManagerRoutes } from './routes/ManagerRoutes.js';
import { MentorRoutes } from './routes/MentorRoutes.js';
import { PublicRoutes } from './routes/PublicRoutes.js';

export { getRootNavigationItems } from './navigationPolicy.js';

export function App() {
  const { pathname } = useLocation();
  const canAccess = useCallback((user: Parameters<typeof canAccessPath>[1]) => canAccessPath(pathname, user), [pathname]);

  return (
    <ProtectedRoute protectedPathPrefixes={[...protectedPathPrefixes]} canAccess={canAccess}>
      <RouteErrorBoundary>
        <Suspense fallback={null}>
          <Routes>
            {AdminRoutes()}
            {ManagerRoutes()}
            {InstructorRoutes()}
            {MentorRoutes()}
            {LearnerRoutes()}
            {PublicRoutes()}
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </ProtectedRoute>
  );
}
