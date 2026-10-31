import { slugify } from './slugify.js';

/** Keep readable ASCII slugs; a localized/short title still needs a valid 3–80 character API identifier. */
export function lessonSlug(title: string): string {
  const slug = slugify(title).replace(/-+$/, '');
  return slug.length >= 3 ? slug : `lesson-${crypto.randomUUID()}`;
}
