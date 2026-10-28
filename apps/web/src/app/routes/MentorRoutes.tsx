import { lazy } from 'react';
import { Outlet, Route } from 'react-router-dom';

const MentorChecklistReviewsPage = lazy(() => import('../MentorChecklistReviewsPage.js').then((m) => ({ default: m.MentorChecklistReviewsPage })));
const AllSessionsPage = lazy(() => import('../AdminChecklistSessionsPage.js').then((m) => ({ default: () => <m.AdminChecklistSessionsPage variant="observer" /> })));
const SessionReportPage = lazy(() => import('../AdminChecklistSessionReportPage.js').then((m) => ({ default: () => <m.AdminChecklistSessionReportPage variant="observer" /> })));

export function MentorRoutes() {
  return (
    <Route path="/mentor" element={<Outlet />}>
      <Route index element={<MentorChecklistReviewsPage />} />
      <Route path="sessions" element={<AllSessionsPage />} />
      <Route path="sessions/:id" element={<SessionReportPage />} />
    </Route>
  );
}
