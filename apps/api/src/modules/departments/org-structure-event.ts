import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

export type OrgStructureEventType =
  | 'department.created'
  | 'department.updated'
  | 'department.moved'
  | 'department.archived'
  | 'department.restored'
  | 'department_type.created'
  | 'department_type.updated'
  | 'department_type.archived'
  | 'department_type.restored';

export type RecordOrgStructureEventInput = {
  organizationId: string;
  actorId: string | null;
  entityType: 'department' | 'department_type';
  entityId: string;
  eventType: OrgStructureEventType;
  operationId: string;
  /** Never put secrets, tokens, raw CSV, email lists, or a full request body here. */
  metadata?: Record<string, unknown>;
};

/**
 * Plan invariant #21: critical org-structure changes are recorded in OrgStructureEvent in
 * the SAME transaction as the domain mutation — unlike AuditLogService's best-effort
 * fire-and-forget write, a failure here must roll back the mutation it describes, so this
 * takes the active transaction client directly and never swallows errors.
 */
export async function recordOrgStructureEvent(
  client: TransactionClient,
  input: RecordOrgStructureEventInput,
): Promise<void> {
  await client.orgStructureEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      operationId: input.operationId,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function newOperationId(): string {
  return randomUUID();
}

const MAX_SERIALIZATION_RETRIES = 5;

/**
 * Runs `fn` in a Serializable transaction, retrying on Postgres serialization failures
 * (Prisma error code P2034) up to `maxAttempts` times, per plan invariant #19. Used for
 * reparent, where two concurrent moves (A under B, B under A) must never both commit.
 */
export async function runSerializableWithRetry<T>(
  prisma: PrismaClient,
  fn: (client: TransactionClient) => Promise<T>,
  maxAttempts = MAX_SERIALIZATION_RETRIES,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
    } catch (error) {
      const isSerializationFailure =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!isSerializationFailure || attempt === maxAttempts) throw error;
    }
  }
  throw new Error('unreachable: runSerializableWithRetry exhausted attempts without returning or throwing');
}
