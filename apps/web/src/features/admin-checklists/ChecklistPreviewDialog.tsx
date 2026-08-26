import type { ReactNode } from 'react';

export function ChecklistPreviewDialog({ children, label }: { children: ReactNode; label: string }) {
  return <div className="admin-preview-overlay" role="dialog" aria-modal="true" aria-label={label}>{children}</div>;
}
