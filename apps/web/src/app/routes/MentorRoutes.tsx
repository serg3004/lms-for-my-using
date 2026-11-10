import { lazy } from 'react';
import { Outlet, Route } from 'react-router-dom';

const ChecklistAnswerSetsPage = lazy(() => import('../ChecklistAnswerSetsPage.js').then((m) => ({ default: m.ChecklistAnswerSetsPage })));

const ChecklistScalesPage = lazy(() => import('../ChecklistScalesPage.js').then((m) => ({ default: m.ChecklistScalesPage })));

const MentorChecklistReviewsPage = lazy(() => import('../MentorChecklistReviewsPage.js').then((m) => ({ default: m.MentorChecklistReviewsPage })));
const AllSessionsPage = lazy(() => import('../AdminChecklistSessionsPage.js').then((m) => ({ default: () => <m.AdminChecklistSessionsPage variant="observer" /> })));
const SessionReportPage = lazy(() => import('../AdminChecklistSessionReportPage.js').then((m) => ({ default: () => <m.AdminChecklistSessionReportPage variant="observer" /> })));
const LibraryPage = lazy(() => import('../AdminChecklistsPage.js').then((m) => ({ default: () => <m.AdminChecklistsPage variant="observer" /> })));
const SheetAnalyticsPage = lazy(() => import('../SheetAnalyticsPage.js').then((m) => ({ default: m.ObserverSheetAnalyticsPage })));
const AnalyticsPage = lazy(() => import('../ObserverChecklistAnalyticsPage.js').then((m) => ({ default: m.ObserverChecklistAnalyticsPage })));

export function MentorRoutes() {
  return (
    <Route path="/mentor" element={<Outlet />}>
      <Route path="answer-sets" element={<ChecklistAnswerSetsPage observer />} />
      <Route path="answer-sets/:setId" element={<ChecklistAnswerSetsPage observer />} />
      <Route path="scales" element={<ChecklistScalesPage observer />} />
      <Route path="scales/:scaleId" element={<ChecklistScalesPage observer />} />
      <Route index element={<MentorChecklistReviewsPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
      <Route path="sheet-analytics" element={<SheetAnalyticsPage />} />
      <Route path="library" element={<LibraryPage />} />
      <Route path="sessions" element={<AllSessionsPage />} />
      <Route path="sessions/:id" element={<SessionReportPage />} />
    </Route>
  );
}
