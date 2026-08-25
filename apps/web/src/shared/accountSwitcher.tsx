import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentUser, type UserRole } from './apiClient.js';
import { useOptionalSession } from './session.js';

const ROLE_ORDER: readonly UserRole[] = ['admin', 'instructor', 'mentor', 'manager', 'learner'];

const ROLE_HOME: Record<UserRole, string> = {
  admin: '/admin',
  instructor: '/instructor/dashboard',
  mentor: '/mentor',
  manager: '/manager/dashboard',
  learner: '/learn',
};

const ROLE_LABEL_KEY: Record<UserRole, string> = {
  admin: 'admin.navLink',
  instructor: 'instructor.navLink',
  mentor: 'mentor.navLink',
  manager: 'manager.navLink',
  learner: 'learner.navLink',
};

export function getActiveRole(pathname: string): UserRole | null {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname.startsWith('/instructor')) return 'instructor';
  if (pathname.startsWith('/mentor')) return 'mentor';
  if (pathname.startsWith('/manager')) return 'manager';
  if (pathname.startsWith('/learn')) return 'learner';
  return null;
}

// Every authenticated user can reach the learner area regardless of role.
export function getAvailableRoles(roles: UserRole[]): UserRole[] {
  return ROLE_ORDER.filter((role) => role === 'learner' || roles.includes(role));
}

export function AccountSwitcher() {
  const { t } = useTranslation();
  const session = useOptionalSession();
  const [fallbackRoles, setFallbackRoles] = useState<UserRole[] | null>(null);
  const roles = session ? session.currentUser?.roles ?? null : fallbackRoles;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (session) return;
    let mounted = true;
    void getCurrentUser().then((user) => { if (mounted) setFallbackRoles(user.roles); }).catch(() => { if (mounted) setFallbackRoles(null); });
    return () => { mounted = false; };
  }, [session]);

  if (!roles) return null;

  const available = getAvailableRoles(roles);
  if (available.length < 2) return null;

  const activeRole = getActiveRole(typeof window !== 'undefined' ? window.location.pathname : '');

  return (
    <div className="account-switcher">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="account-switcher__btn"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {t('accountSwitcher.button')}
      </button>
      {open && (
        <div className="account-switcher__menu" role="menu">
          {available.map((role) => (
            <a
              className={`account-switcher__option${role === activeRole ? ' account-switcher__option--active' : ''}`}
              href={ROLE_HOME[role]}
              key={role}
              role="menuitem"
            >
              {t(ROLE_LABEL_KEY[role])}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
