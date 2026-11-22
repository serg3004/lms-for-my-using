import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination.schema.js';
import { customFieldValuesSchema } from '../user-fields/public.js';

export const initialUserRoleSchema = z.enum(['learner', 'instructor', 'mentor', 'manager', 'admin']);

export const userStatusSchema = z.enum(['active', 'invited', 'suspended', 'archived']);

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  status: userStatusSchema.optional(),
  /** PR 499: show only people whose custom field `fieldKey` equals `fieldValue`. */
  fieldKey: z.string().trim().min(1).max(40).optional(),
  fieldValue: z.string().trim().min(1).max(500).optional(),
}).refine((query) => (query.fieldKey === undefined) === (query.fieldValue === undefined), { message: 'fieldKey and fieldValue go together', path: ['fieldKey'] });
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
  /** PR 501: a person without a mailbox. Then the employee number is required and exactly one of `temporaryPassword` / `activateByIdentity` says how they get in. */
  email: createUserSchema.shape.email.optional(),
  password: createUserSchema.shape.password.optional(),
  /** PR 501: the person sets their own password at the public activation screen by confirming organization, employee number and full name. */
  activateByIdentity: z.boolean().optional(),
  departmentId: z.guid().optional(),
  /** PR 489: no password and no invitation: the server makes a temporary password, shown once, and the first sign-in leads to choosing their own. */
  temporaryPassword: z.boolean().optional(),
  role: initialUserRoleSchema.optional(),
  /** PR 499: values of custom fields, `{ key: value }`; `null` clears one. */
  customFields: customFieldValuesSchema.optional(),
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
    customFields: customFieldValuesSchema.optional(),
  });

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'archived']),
  /** PR 495: archiving goes through only after the administrator has seen the impact and confirmed it. */
  confirm: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateUserRequestInput = z.infer<typeof createUserRequestSchema>;
export type CreateBulkUsersInput = z.infer<typeof createBulkUsersSchema>;
export type ImportUsersInput = z.infer<typeof importUsersSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

/**
 * PR 492: a row of an import file. The password is optional (no password: an email invitation), the department is
 * named by its title and the role by its key or its name in any interface language; the service resolves both per row.
 */
export const importUserItemSchema = createBulkUserItemSchema.extend({
  /** PR 501: a row without an email needs `activateByIdentity` and an employee number. */
  email: createUserSchema.shape.email.optional(),
  activateByIdentity: z.boolean().optional(),
  password: createUserSchema.shape.password.optional(),
  department: z.string().trim().min(1).max(160).optional(),
  role: z.string().trim().min(1).max(40).optional(),
  customFields: customFieldValuesSchema.optional(),
});

/** PR 497: the most people one bulk action may touch ("everyone matching the filter" is refused above this). */
export const bulkActionMaxUsers = 500;
export const bulkActionExplicitMaxUsers = 200;

const bulkTargetSchema = z.object({
  /** Chosen rows; or `filter` for "everyone matching the current list filter". Exactly one of the two. */
  userIds: z.array(invitationUserIdSchema).min(1).max(bulkActionExplicitMaxUsers).transform((ids) => [...new Set(ids)]).optional(),
  filter: z.object({ search: listUsersQuerySchema.shape.search, status: userStatusSchema.optional() }).strict().optional(),
});

const oneTarget = (input: { userIds?: unknown; filter?: unknown }) => (input.userIds === undefined) !== (input.filter === undefined);
const oneTargetMessage = { message: 'Send either userIds or filter', path: ['userIds'] };

export const bulkActionNames = ['suspend', 'activate', 'archive', 'move', 'resend'] as const;

export const bulkActionSchema = bulkTargetSchema
  .extend({
    action: z.enum(bulkActionNames),
    /** `move`: the department the people are placed in (their current primary department is closed). */
    departmentId: z.guid().optional(),
    /** `archive` goes through only after the administrator has seen the summed impact. */
    confirm: z.boolean().optional(),
  })
  .strict()
  .refine(oneTarget, oneTargetMessage)
  .refine((input) => (input.action === 'move') === (input.departmentId !== undefined), { message: 'departmentId is for the move action only and is required there', path: ['departmentId'] });

export const bulkImpactSchema = bulkTargetSchema.strict().refine(oneTarget, oneTargetMessage);

export type BulkActionInput = z.infer<typeof bulkActionSchema>;
export type BulkImpactInput = z.infer<typeof bulkImpactSchema>;
export type BulkActionName = (typeof bulkActionNames)[number];
