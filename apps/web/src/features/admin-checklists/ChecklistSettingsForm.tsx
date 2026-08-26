import type { ReactNode } from 'react';

export function ChecklistSettingsForm({ children }: { children: ReactNode }) {
  return <section className="admin-card">{children}</section>;
}
