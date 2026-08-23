import type { CurrentUser } from '../shared/api/types.js';

export { getRootNavigationItems } from '../shared/rootNavigation.js';

export const protectedPathPrefixes = ['/learn', '/admin', '/manager', '/instructor', '/mentor'] as const;

export function canAccessPath(pathname: string, user: Pick<CurrentUser, 'roles'>) {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return user.roles.includes('admin') || user.roles.includes('manager');
  }
  if (pathname === '/manager' || pathname.startsWith('/manager/')) {
    return user.roles.includes('manager');
  }
  if (pathname === '/instructor' || pathname.startsWith('/instructor/')) {
    return user.roles.includes('instructor');
  }
  if (pathname === '/mentor' || pathname.startsWith('/mentor/')) {
    return user.roles.includes('mentor');
  }
  return true;
}
