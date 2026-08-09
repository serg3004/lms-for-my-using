import type { Prisma } from '@prisma/client';

export type OutboxEventInput = {
  topic: string;
  payload: Prisma.InputJsonValue;
  id?: string;
};

export type OutboxLag = {
  pending: number;
  oldestEventAgeMs: number;
};
