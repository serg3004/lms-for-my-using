import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination.schema.js';

/** Plan invariant: bulk transfer is atomic and bounded at 500 users per request. */
export const MAX_BULK_TRANSFER_USERS = 500;

export const listDepartmentUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
});
export type ListDepartmentUsersQuery = z.infer<typeof listDepartmentUsersQuerySchema>;

export const createDepartmentMembershipSchema = z.object({
  organizationId: z.guid(),
  departmentId: z.guid(),
  userId: z.guid(),
  isPrimary: z.boolean().default(false),
  positionId: z.guid().optional(),
});
export type CreateDepartmentMembershipInput = z.infer<typeof createDepartmentMembershipSchema>;

export const departmentTransferSchema = z.object({
  departmentId: z.guid(),
  positionId: z.guid().optional(),
});
export type DepartmentTransferInput = z.infer<typeof departmentTransferSchema>;

export const bulkTransferSchema = z.object({
  userIds: z.array(z.guid()).min(1).max(MAX_BULK_TRANSFER_USERS),
  positionId: z.guid().optional(),
});
export type BulkTransferInput = z.infer<typeof bulkTransferSchema>;
