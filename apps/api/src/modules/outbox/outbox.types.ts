import type { Prisma } from '@prisma/client';

export type OutboxEventInput = {
  topic: string;
  payload: Prisma.InputJsonObject;
};

export type OutboxMetrics = {
  unpublishedCount: number;
  oldestUnpublishedAt: Date | null;
  lagMilliseconds: number;
};
