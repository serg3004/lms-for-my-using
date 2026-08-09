/**
 * Mangles a slug before soft-deleting a row so it stops occupying its unique-slug
 * constraint (courseId+slug, organizationId+slug, etc. — none of them exclude
 * deletedAt rows). Without this, recreating a record with the same title/slug
 * after deleting the original fails with a 409 forever.
 */
export function releaseSlugOnDelete(slug: string, id: string): string {
  return `${slug}--deleted-${id}`;
}
