import { z } from 'zod';

export const userStatusSchema = z.enum(['active', 'invited', 'suspended', 'archived']);

export const createUserSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(255),
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

export const usersBulkCreateMaxItems = 50;

export const createBulkUserItemSchema = createUserSchema.omit({ organizationId: true });

export const createBulkUsersSchema = z
  .object({
    organizationId: z.string().uuid(),
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
  organizationId: z.string().uuid(),
  mode: z.enum(['validateOnly', 'create']).default('validateOnly'),
  users: z.array(z.record(z.unknown())).min(1).max(usersImportMaxItems),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateBulkUsersInput = z.infer<typeof createBulkUsersSchema>;
export type ImportUsersInput = z.infer<typeof importUsersSchema>;
