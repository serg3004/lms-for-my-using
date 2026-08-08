import { z } from 'zod';

export const USER_ROLES = ['learner', 'instructor', 'manager', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Canonical runtime validator for roles crossing an application boundary. */
export const userRoleSchema = z.enum(USER_ROLES);
