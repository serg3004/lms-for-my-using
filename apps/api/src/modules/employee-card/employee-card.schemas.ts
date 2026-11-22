import { z } from 'zod';

import { cardBlocks, inspectorDefaultVisible, inspectorVisible } from '../../common/employee-card.js';

/** The token printed in the badge QR (see `badge.ts`): 32 random bytes, base64url. */
export const cardTokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

export const cardPolicySchema = z.object({ blocks: z.array(z.enum(cardBlocks)).max(cardBlocks.length) }).strict();
export type CardPolicyInput = z.infer<typeof cardPolicySchema>;

/** An outside inspector: invited by email, sees the full name and only the listed facts, until the end of the access. */
export const createInspectorSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  visible: z.array(z.enum(inspectorVisible)).max(inspectorVisible.length).default([...inspectorDefaultVisible]),
  accessUntil: z.coerce.date(),
}).strict();
export type CreateInspectorInput = z.infer<typeof createInspectorSchema>;

