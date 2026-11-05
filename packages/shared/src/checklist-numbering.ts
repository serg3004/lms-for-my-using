/** Only generated prefixes are hidden; numbers typed by the author remain part of the title. */
export function checklistLabel(text: string, number: string | number | undefined, showNumbering = true, separator = ' '): string {
  return showNumbering && number !== undefined && number !== '' ? `${number}${separator}${text}` : text;
}

/** Stable sheet numbers are calculated before filtering answered criteria. Legacy snapshots default to enabled. */
export function checklistNumbers(items: readonly { id: string; groupId?: string | null; order: number }[], groups: readonly { id: string; order: number }[]) {
  const used = new Set(items.map((item) => item.groupId));
  const groupNumbers = new Map([...groups].sort((a, b) => a.order - b.order).filter((group) => used.has(group.id)).map((group, index) => [group.id, String(index + 1)]));
  const counters = new Map<string | null, number>();
  const itemNumbers = new Map<string, string>();
  for (const item of [...items].sort((a, b) => a.order - b.order)) {
    const groupId = item.groupId && groupNumbers.has(item.groupId) ? item.groupId : null;
    const index = (counters.get(groupId) ?? 0) + 1;
    counters.set(groupId, index);
    itemNumbers.set(item.id, groupId === null ? String(index) : `${groupNumbers.get(groupId)}.${index}`);
  }
  return { groupNumbers, itemNumbers };
}
