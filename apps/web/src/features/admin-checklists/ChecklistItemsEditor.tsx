import type { ReactNode } from 'react';

export function ChecklistItemsEditor({ children }: { children: ReactNode }) {
  return <section className="admin-card">{children}</section>;
}
