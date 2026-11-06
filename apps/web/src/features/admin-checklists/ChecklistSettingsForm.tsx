import type { CSSProperties, ReactNode } from 'react';

export function ChecklistSettingsForm({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <section className="admin-card" style={style}>{children}</section>;
}
