import { lazy } from 'react';
import { Route } from 'react-router-dom';

import { ForbiddenPage } from '../ForbiddenPage.js';
import { NotFoundPage } from '../NotFoundPage.js';

const BadgePage = lazy(() => import('../BadgePage.js').then((m) => ({ default: m.BadgePage })));
const QrConfirmPage = lazy(() => import('../QrConfirmPage.js').then((m) => ({ default: m.QrConfirmPage })));
const LoginPage = lazy(() => import('../LoginPage.js').then((m) => ({ default: m.LoginPage })));
const ActivatePage = lazy(() => import('../ActivatePage.js').then((m) => ({ default: m.ActivatePage })));
const PasswordResetPage = lazy(() => import('../PasswordResetPage.js').then((m) => ({ default: m.PasswordResetPage })));
const PublicChecklistPage = lazy(() => import('../PublicChecklistPage.js').then((m) => ({ default: m.PublicChecklistPage })));
const ProfilePage = lazy(() => import('../ProfilePage.js').then((m) => ({ default: m.ProfilePage })));
const PublicHomePage = lazy(() => import('../PublicHomePage.js').then((m) => ({ default: m.PublicHomePage })));

export function PublicRoutes() {
  return <>
    <Route path="/profile" element={<ProfilePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/qr-login" element={<QrConfirmPage />} />
    <Route path="/badge" element={<BadgePage />} />
    <Route path="/activate" element={<ActivatePage />} />
    <Route path="/password-reset" element={<PasswordResetPage />} />
    <Route path="/invitation" element={<PasswordResetPage mode="invitation" />} />
    <Route path="/c/:token" element={<PublicChecklistPage />} />
    <Route path="/" element={<PublicHomePage />} />
    <Route path="/403" element={<ForbiddenPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </>;
}
