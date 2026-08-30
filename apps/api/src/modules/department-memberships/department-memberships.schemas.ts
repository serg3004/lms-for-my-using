import { z } from 'zod';

/** Plan invariant: bulk transfer is atomic and bounded at 500 users per request. */
export const MAX_BULK_TRANSFER_USERS = 500;

export const createDepartmentMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  departmentId: z.string().uuid(),
  userId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
});
export type CreateDepartmentMembershipInput = z.infer<typeof createDepartmentMembershipSchema>;

export const departmentTransferSchema = z.object({
  departmentId: z.string().uuid(),
});
export type DepartmentTransferInput = z.infer<typeof departmentTransferSchema>;

export const bulkTransferSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(MAX_BULK_TRANSFER_USERS),
});
export type BulkTransferInput = z.infer<typeof bulkTransferSchema>;
