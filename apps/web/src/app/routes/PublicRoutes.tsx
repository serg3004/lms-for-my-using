import { lazy } from 'react';
import { Route } from 'react-router-dom';

import { ForbiddenPage } from '../ForbiddenPage.js';
import { NotFoundPage } from '../NotFoundPage.js';

const LoginPage = lazy(() => import('../LoginPage.js').then((m) => ({ default: m.LoginPage })));
const PasswordResetPage = lazy(() => import('../PasswordResetPage.js').then((m) => ({ default: m.PasswordResetPage })));
const PublicHomePage = lazy(() => import('../PublicHomePage.js').then((m) => ({ default: m.PublicHomePage })));

export function PublicRoutes() {
  return <>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/password-reset" element={<PasswordResetPage />} />
    <Route path="/" element={<PublicHomePage />} />
    <Route path="/403" element={<ForbiddenPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </>;
}
