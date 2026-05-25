import { z } from 'zod';

export const userStatusSchema = z.enum(['active', 'invited', 'suspended', 'archived']);

export const createUserSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(255),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  status: userStatusSchema.default('active'),
  locale: z.string().trim().min(2).max(12).default('ru'),
  timezone: z.string().trim().min(1).max(64).default('Asia/Almaty'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
