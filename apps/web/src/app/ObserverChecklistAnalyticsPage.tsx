import type { ReactNode } from 'react';

import { ObserverPageLayout } from '../shared/observerLayout.js';
import { ManagerChecklistsPage } from './ManagerChecklistsPage.js';
import { ObserverSessionsNav } from './ObserverSessionsNav.js';

function ObserverAnalyticsLayout({ children }: { children: ReactNode }) {
  return <ObserverPageLayout><ObserverSessionsNav current="analytics" />{children}</ObserverPageLayout>;
}

/**
 * PR 363: the employee analytics and its exports for an instructor or a mentor, over the whole organization
 * (the API scopes a manager to the own team and gives the other three roles everything).
 */
export function ObserverChecklistAnalyticsPage() {
  return <ManagerChecklistsPage Layout={ObserverAnalyticsLayout} />;
}
