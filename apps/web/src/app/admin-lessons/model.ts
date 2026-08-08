export function filterLessons<T extends { title: string; type: string }>(
  lessons: T[],
  search: string,
  typeFilter: 'all' | string,
): T[] {
  const query = search.trim().toLowerCase();
  return lessons.filter((lesson) => {
    const matchesSearch = lesson.title.toLowerCase().includes(query);
    const matchesType = typeFilter === 'all' || lesson.type === typeFilter;
    return matchesSearch && matchesType;
  });
}

export function parseLessonOrder(order: string): number | null {
  const value = Number(order);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
