import { lazy } from 'react';
import { Outlet, Route } from 'react-router-dom';

const MentorChecklistReviewsPage = lazy(() => import('../MentorChecklistReviewsPage.js').then((m) => ({ default: m.MentorChecklistReviewsPage })));

export function MentorRoutes() {
  return (
    <Route path="/mentor" element={<Outlet />}>
      <Route index element={<MentorChecklistReviewsPage />} />
    </Route>
  );
}
