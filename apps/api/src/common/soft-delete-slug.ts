import { randomUUID } from 'node:crypto';

/**
 * Mangles a slug before soft-deleting a row so it stops occupying its unique-slug
 * constraint (courseId+slug, organizationId+slug, etc. — none of them exclude
 * deletedAt rows). Without this, recreating a record with the same title/slug
 * after deleting the original fails with a 409 forever.
 *
 * The random suffix (on top of the row id) matters: slugs are arbitrary user-controlled
 * strings, so without it an attacker could pre-create a row whose slug equals the
 * deterministic `${slug}--deleted-${id}` tombstone value and make the delete itself fail
 * with a unique-constraint violation instead of releasing the original slug.
 */
export function releaseSlugOnDelete(slug: string, id: string): string {
  return `${slug}--deleted-${id}-${randomUUID()}`;
}
