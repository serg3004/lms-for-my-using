import { lazy } from 'react';
import { Navigate, Outlet, Route } from 'react-router-dom';

const ManagerDashboardPage = lazy(() => import('../ManagerDashboardPage.js').then((m) => ({ default: m.ManagerDashboardPage })));
const ManagerTeamPage = lazy(() => import('../ManagerTeamPage.js').then((m) => ({ default: m.ManagerTeamPage })));

export function ManagerRoutes() {
  return (
    <Route path="/manager" element={<Outlet />}>
      <Route index element={<Navigate replace to="/manager/dashboard" />} />
      <Route path="dashboard" element={<ManagerDashboardPage />} />
      <Route path="team" element={<ManagerTeamPage />} />
    </Route>
  );
}
