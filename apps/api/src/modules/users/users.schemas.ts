import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination.schema.js';

export const initialUserRoleSchema = z.enum(['learner', 'instructor', 'mentor', 'manager', 'admin']);

export const userStatusSchema = z.enum(['active', 'invited', 'suspended', 'archived']);

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  status: userStatusSchema.optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const invitationUserIdSchema = z.guid().toLowerCase();
export const resendInvitationsSchema = z.object({
  userIds: z.array(invitationUserIdSchema).min(1).max(20).transform((ids) => [...new Set(ids)]),
});

export const createUserSchema = z.object({
  organizationId: z.guid(),
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  // The password rules are the organization's policy (common/password-policy.ts), applied by the service.
  password: z.string().min(1).max(255),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().min(1).max(80).optional(),
  position: z.string().trim().min(1).max(120).optional(),
  shift: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  status: userStatusSchema.default('active'),
  locale: z.string().trim().min(2).max(12).default('ru'),
  timezone: z.string().trim().min(1).max(64).default('Asia/Almaty'),
});

/** PR 483: `POST /users` may name the department the new user is placed in (required for a registrar limited to a department). */
/** PR 487: without `password` the user is created `invited` and receives an email invitation to set their own. */
export const createUserRequestSchema = createUserSchema.extend({
  password: createUserSchema.shape.password.optional(),
  departmentId: z.guid().optional(),
  /** PR 489: no password and no invitation: the server makes a temporary password, shown once, and the first sign-in leads to choosing their own. */
  temporaryPassword: z.boolean().optional(),
  role: initialUserRoleSchema.optional(),
});

export const usersBulkCreateMaxItems = 50;

export const createBulkUserItemSchema = createUserSchema.omit({ organizationId: true });

export const createBulkUsersSchema = z
  .object({
    organizationId: z.guid(),
    departmentId: z.guid().optional(),
    role: initialUserRoleSchema.optional(),
    users: z.array(createBulkUserItemSchema).min(1).max(usersBulkCreateMaxItems),
  })
  .superRefine((input, context) => {
    const emails = new Set<string>();

    input.users.forEach((user, index) => {
      if (emails.has(user.email)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate user email in bulk payload',
          path: ['users', index, 'email'],
        });
      }

      emails.add(user.email);
    });
  });

export const usersImportMaxItems = 100;

export const importUsersSchema = z.object({
  organizationId: z.guid(),
  departmentId: z.guid().optional(),
  role: initialUserRoleSchema.optional(),
  mode: z.enum(['validateOnly', 'create']).default('validateOnly'),
  users: z.array(z.record(z.string(), z.unknown())).min(1).max(usersImportMaxItems),
});

export const updateUserSchema = createUserSchema
  .omit({ organizationId: true, password: true })
  .extend({
    role: z.enum(['learner', 'instructor', 'mentor', 'manager', 'admin']).nullable().optional(),
  });

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateUserRequestInput = z.infer<typeof createUserRequestSchema>;
export type CreateBulkUsersInput = z.infer<typeof createBulkUsersSchema>;
export type ImportUsersInput = z.infer<typeof importUsersSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
