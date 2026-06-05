export function sortLessons<T extends { order: number; title: string }>(lessons: T[]): T[] {
  return [...lessons].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
}
