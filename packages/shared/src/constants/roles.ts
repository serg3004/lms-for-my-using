export const USER_ROLES = ['learner', 'instructor', 'manager', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];
