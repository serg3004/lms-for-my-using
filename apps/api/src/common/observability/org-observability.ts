import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Histogram } from 'prom-client';

export type OrgDiagnosticLogger = {
  warn(context: Record<string, string>, message: string): void;
};

export function orgFailureReason(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002' || error.code === 'P2003' || error.code === 'P2014') return 'db_constraint';
    if (error.code === 'P2034') return 'serialization_conflict';
    return 'database';
  }
  if (error instanceof HttpException) {
    const message = error.message.toLowerCase();
    if (message.includes('cycle') || message.includes('descendant') || message.includes('own parent')) return 'cycle';
    if (message.includes('depth') || message.includes('levels')) return 'depth';
    if (error.getStatus() === 403) return 'denied';
    if (error.getStatus() === 404) return 'not_found';
    if (error.getStatus() === 409) return 'conflict';
    if (error.getStatus() === 400) return 'validation';
  }
  return 'internal';
}

/** Records only predefined labels; callers must never pass IDs or user-controlled strings. */
export async function observeOrgDuration<T>(
  histogram: Histogram<string>,
  labels: Record<string, string>,
  action: () => Promise<T>,
): Promise<T> {
  const end = histogram.startTimer(labels);
  try {
    const result = await action();
    end({ outcome: 'success' });
    return result;
  } catch (error) {
    end({ outcome: 'error' });
    throw error;
  }
}

export function logOrgDiagnostic(
  logger: OrgDiagnosticLogger,
  event: 'org_reparent_failed' | 'org_import_failed' | 'org_scope_resolution_failed' | 'org_scope_resolution_denied',
  reason: string,
  extra: Record<string, string> = {},
): void {
  logger.warn({ event, reason, ...extra }, 'Organization structure operation diagnostic');
}
