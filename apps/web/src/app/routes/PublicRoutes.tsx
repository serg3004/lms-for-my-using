import { lazy } from 'react';
import { Route } from 'react-router-dom';

import { ForbiddenPage } from '../ForbiddenPage.js';
import { NotFoundPage } from '../NotFoundPage.js';

const LoginPage = lazy(() => import('../LoginPage.js').then((m) => ({ default: m.LoginPage })));
const PasswordResetPage = lazy(() => import('../PasswordResetPage.js').then((m) => ({ default: m.PasswordResetPage })));
const PublicChecklistPage = lazy(() => import('../PublicChecklistPage.js').then((m) => ({ default: m.PublicChecklistPage })));
const ProfilePage = lazy(() => import('../ProfilePage.js').then((m) => ({ default: m.ProfilePage })));
const PublicHomePage = lazy(() => import('../PublicHomePage.js').then((m) => ({ default: m.PublicHomePage })));

export function PublicRoutes() {
  return <>
    <Route path="/profile" element={<ProfilePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/password-reset" element={<PasswordResetPage />} />
    <Route path="/invitation" element={<PasswordResetPage mode="invitation" />} />
    <Route path="/c/:token" element={<PublicChecklistPage />} />
    <Route path="/" element={<PublicHomePage />} />
    <Route path="/403" element={<ForbiddenPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </>;
}
