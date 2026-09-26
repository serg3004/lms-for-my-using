import type { ReactNode } from 'react';

/** Sidebar navigation icons shared by the admin and workspace shells (UI refresh PR 310). */
export type NavIconName =
  | 'dashboard'
  | 'courses'
  | 'lessons'
  | 'materials'
  | 'assessments'
  | 'checklists'
  | 'users'
  | 'assignments'
  | 'results'
  | 'orgStructure'
  | 'roles'
  | 'appearance'
  | 'audit'
  | 'home'
  | 'progress'
  | 'certificates'
  | 'notifications'
  | 'profile'
  | 'team'
  | 'overdue'
  | 'reports';

const ICON_PATHS: Record<NavIconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  courses: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  lessons: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  materials: <path d="M4 6h16M4 12h16M4 18h10" />,
  assessments: (
    <>
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  checklists: (
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c1-3.6 3.6-5.5 6.5-5.5s5.5 1.9 6.5 5.5" />
      <circle cx="18" cy="8.5" r="2.6" />
      <path d="M16.7 14.7c2.2.4 3.9 2 4.7 4.9" />
    </>
  ),
  assignments: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </>
  ),
  results: <path d="M3 20V10M10 20V4M17 20v-7" />,
  orgStructure: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  roles: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </>
  ),
  appearance: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  audit: <path d="M12 2l8 4v6c0 5-3.4 7.8-8 10-4.6-2.2-8-5-8-10V6l8-4z" />,
  home: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3V10.5Z" />,
  progress: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  certificates: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14 7 22l5-3 5 3-1.5-8" />
    </>
  ),
  notifications: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4" />,
  profile: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" />,
  team: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M6 21v-1a6 6 0 0 1 12 0v1" />
      <path d="M4.5 13.5A3 3 0 0 1 6 8M19.5 13.5A3 3 0 0 0 18 8" />
    </>
  ),
  overdue: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  reports: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </>
  ),
};

/** Icon for a sidebar destination, keyed by its route. Unknown routes fall back to `dashboard`. */
const ICON_BY_HREF: Record<string, NavIconName> = {
  '/admin': 'dashboard',
  '/admin/courses': 'courses',
  '/admin/lessons': 'lessons',
  '/admin/materials': 'materials',
  '/admin/assessments': 'assessments',
  '/admin/checklists': 'checklists',
  '/admin/users': 'users',
  '/admin/assignments': 'assignments',
  '/admin/results': 'results',
  '/admin/departments': 'orgStructure',
  '/admin/roles': 'roles',
  '/admin/appearance': 'appearance',
  '/admin/audit-log': 'audit',
  '/learn': 'home',
  '/learn/courses': 'courses',
  '/learn/assignments': 'assignments',
  '/learn/assessments': 'assessments',
  '/learn/checklists': 'checklists',
  '/learn/progress': 'progress',
  '/learn/certificates': 'certificates',
  '/learn/notifications': 'notifications',
  '/learn/profile': 'profile',
  '/instructor/dashboard': 'dashboard',
  '/instructor/courses': 'courses',
  '/instructor/checklists': 'checklists',
  '/manager/dashboard': 'dashboard',
  '/manager/team': 'team',
  '/manager/overdue': 'overdue',
  '/manager/reports': 'reports',
  '/manager/checklists': 'checklists',
  '/mentor': 'checklists',
};

export function navIconForHref(href: string): NavIconName {
  return ICON_BY_HREF[href] ?? 'dashboard';
}

export function NavIcon({ name, className = 'nav-icon' }: { name: NavIconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-icon={name}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
