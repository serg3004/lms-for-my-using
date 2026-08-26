import type { ReactNode } from 'react';

export function ChecklistAssignmentPanel({ children }: { children: ReactNode }) {
  return <section className="admin-card">{children}</section>;
}
