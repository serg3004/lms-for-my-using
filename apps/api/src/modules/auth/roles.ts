import { SetMetadata } from '@nestjs/common';

export type UserRole = 'learner' | 'instructor' | 'manager' | 'admin';

export const rolesMetadataKey = 'roles';

export const rolePolicies = {
  organizationsRead: ['admin'],
  usersRead: ['admin', 'manager'],
  membershipsRead: ['admin', 'manager'],
  membershipsCreate: ['admin'],
  groupsRead: ['admin', 'manager'],
  groupsCreate: ['admin', 'manager'],
  coursesRead: ['admin', 'manager', 'instructor'],
  coursesCreate: ['admin', 'instructor'],
} as const satisfies Record<string, readonly UserRole[]>;

export function Roles(...roles: UserRole[]) {
  return SetMetadata(rolesMetadataKey, roles);
}
