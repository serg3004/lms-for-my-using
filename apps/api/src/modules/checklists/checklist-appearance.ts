import type { Prisma } from '@prisma/client';
import { sanitizeAppearance } from '@lms/shared/checklist-appearance';

/** PR 422: a copy or template keeps the look of each block kind; overrides name ids the new sheet does not have. */
export function kindAppearance(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue | null {
  const appearance = sanitizeAppearance(value);
  return appearance?.blocks ? ({ blocks: appearance.blocks } as unknown as Prisma.InputJsonValue) : null;
}
