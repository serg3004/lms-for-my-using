import type { CSSProperties, ReactNode } from 'react';

export function ChecklistItemsEditor({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <section className="admin-card" style={style}>{children}</section>;
}
