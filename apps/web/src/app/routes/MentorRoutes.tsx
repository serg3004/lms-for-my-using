import { lazy } from 'react';
import { Outlet, Route } from 'react-router-dom';

const MentorChecklistReviewsPage = lazy(() => import('../MentorChecklistReviewsPage.js').then((m) => ({ default: m.MentorChecklistReviewsPage })));
const AllSessionsPage = lazy(() => import('../AdminChecklistSessionsPage.js').then((m) => ({ default: () => <m.AdminChecklistSessionsPage variant="observer" /> })));
const SessionReportPage = lazy(() => import('../AdminChecklistSessionReportPage.js').then((m) => ({ default: () => <m.AdminChecklistSessionReportPage variant="observer" /> })));
const LibraryPage = lazy(() => import('../AdminChecklistsPage.js').then((m) => ({ default: () => <m.AdminChecklistsPage variant="observer" /> })));
const AnalyticsPage = lazy(() => import('../ObserverChecklistAnalyticsPage.js').then((m) => ({ default: m.ObserverChecklistAnalyticsPage })));

export function MentorRoutes() {
  return (
    <Route path="/mentor" element={<Outlet />}>
      <Route index element={<MentorChecklistReviewsPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
      <Route path="library" element={<LibraryPage />} />
      <Route path="sessions" element={<AllSessionsPage />} />
      <Route path="sessions/:id" element={<SessionReportPage />} />
    </Route>
  );
}
