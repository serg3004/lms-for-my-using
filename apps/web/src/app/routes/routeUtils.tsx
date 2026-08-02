import type { ReactNode } from 'react';

import { Breadcrumbs, type BreadcrumbItem } from '../../shared/ui.js';

export function renderWithBreadcrumbs(page: ReactNode, items: BreadcrumbItem[]) {
  return (
    <>
      <Breadcrumbs items={items} />
      {page}
    </>
  );
}
