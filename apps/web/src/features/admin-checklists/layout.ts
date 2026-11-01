import type { ChecklistItemGroup, ChecklistItemSummary } from '../../shared/api/types.js';

// PR 402: pure model of the drag-and-drop layout of "Groups and criteria". The builder keeps the
// real items/groups in state; while a drag is in progress it works on a Layout draft instead and
// commits the final one in a single request.

/** Key of the bucket that holds criteria without a group. */
export const UNGROUPED = '__ungrouped__';

export type Layout = {
  /** Group ids in display order. */
  groupIds: string[];
  /** Criteria ids per container: a group id or UNGROUPED, in display order. */
  itemsByContainer: Record<string, string[]>;
};

export function buildLayout(items: ChecklistItemSummary[], groups: ChecklistItemGroup[]): Layout {
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
  const known = new Set(sortedGroups.map((group) => group.id));
  const sortedItems = [...items].sort((a, b) => a.order - b.order);
  const itemsByContainer: Record<string, string[]> = { [UNGROUPED]: [] };
  for (const group of sortedGroups) itemsByContainer[group.id] = [];
  for (const item of sortedItems) {
    const key = item.groupId != null && known.has(item.groupId) ? item.groupId : UNGROUPED;
    itemsByContainer[key]!.push(item.id);
  }
  return { groupIds: sortedGroups.map((group) => group.id), itemsByContainer };
}

export function containerOf(layout: Layout, itemId: string): string | null {
  for (const [key, ids] of Object.entries(layout.itemsByContainer)) {
    if (ids.includes(itemId)) return key;
  }
  return null;
}

function isContainer(layout: Layout, id: string) {
  return id === UNGROUPED || layout.groupIds.includes(id);
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Called while an item is dragged over another item or over a group: moves it into that
 * container so the drop preview shows it there. Reordering inside one container is left to the
 * sortable preview and applied by {@link finishDrag}.
 */
export function moveItemAcrossContainers(layout: Layout, activeId: string, overId: string, below: boolean): Layout {
  const source = containerOf(layout, activeId);
  if (source === null || layout.groupIds.includes(activeId)) return layout;
  const target = isContainer(layout, overId) ? overId : containerOf(layout, overId);
  if (target === null || target === source) return layout;
  const targetItems = layout.itemsByContainer[target]!;
  const overIndex = targetItems.indexOf(overId);
  const index = overIndex === -1 ? targetItems.length : overIndex + (below ? 1 : 0);
  return {
    groupIds: layout.groupIds,
    itemsByContainer: {
      ...layout.itemsByContainer,
      [source]: layout.itemsByContainer[source]!.filter((id) => id !== activeId),
      [target]: [...targetItems.slice(0, index), activeId, ...targetItems.slice(index)],
    },
  };
}

/** Applies the drop: reorders groups, or criteria inside their (already updated) container. */
export function finishDrag(layout: Layout, activeId: string, overId: string): Layout {
  if (layout.groupIds.includes(activeId)) {
    const from = layout.groupIds.indexOf(activeId);
    const to = layout.groupIds.indexOf(overId);
    if (to === -1 || from === to) return layout;
    return { ...layout, groupIds: arrayMove(layout.groupIds, from, to) };
  }
  const container = containerOf(layout, activeId);
  if (container === null) return layout;
  const list = layout.itemsByContainer[container]!;
  const from = list.indexOf(activeId);
  const to = list.indexOf(overId);
  if (to === -1 || from === to) return layout;
  return { ...layout, itemsByContainer: { ...layout.itemsByContainer, [container]: arrayMove(list, from, to) } };
}

export function sameLayout(a: Layout, b: Layout): boolean {
  if (a.groupIds.join() !== b.groupIds.join()) return false;
  const keys = new Set([...Object.keys(a.itemsByContainer), ...Object.keys(b.itemsByContainer)]);
  for (const key of keys) {
    if ((a.itemsByContainer[key] ?? []).join() !== (b.itemsByContainer[key] ?? []).join()) return false;
  }
  return true;
}

/** Same numbering the server uses: group order = index, criteria order counts across all containers. */
export function applyLayout(items: ChecklistItemSummary[], groups: ChecklistItemGroup[], layout: Layout) {
  const itemPlace = new Map<string, { groupId: string | null; order: number }>();
  let order = 0;
  for (const key of [...layout.groupIds, UNGROUPED]) {
    for (const id of layout.itemsByContainer[key] ?? []) {
      itemPlace.set(id, { groupId: key === UNGROUPED ? null : key, order: order++ });
    }
  }
  const groupOrder = new Map(layout.groupIds.map((id, index) => [id, index]));
  return {
    items: items.map((item) => ({ ...item, ...(itemPlace.get(item.id) ?? {}) })),
    groups: groups.map((group) => ({ ...group, order: groupOrder.get(group.id) ?? group.order })),
  };
}

export function toLayoutPayload(layout: Layout) {
  return {
    groups: layout.groupIds.map((id) => ({ id, itemIds: layout.itemsByContainer[id] ?? [] })),
    ungroupedItemIds: layout.itemsByContainer[UNGROUPED] ?? [],
  };
}

export type LayoutBucket = { group: ChecklistItemGroup | null; items: ChecklistItemSummary[] };

/** Buckets for rendering a draft layout. While dragging, an empty "ungrouped" drop zone is kept. */
export function layoutBuckets(layout: Layout, items: ChecklistItemSummary[], groups: ChecklistItemGroup[]): LayoutBucket[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const pick = (key: string) => (layout.itemsByContainer[key] ?? []).flatMap((id) => (itemById.has(id) ? [itemById.get(id)!] : []));
  const buckets: LayoutBucket[] = layout.groupIds.flatMap((id) => (groupById.has(id) ? [{ group: groupById.get(id)!, items: pick(id) }] : []));
  if (groups.length > 0) buckets.push({ group: null, items: pick(UNGROUPED) });
  return buckets;
}
