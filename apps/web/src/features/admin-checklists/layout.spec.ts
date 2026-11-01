import { describe, expect, it } from 'vitest';
import type { ChecklistItemGroup, ChecklistItemSummary } from '../../shared/api/types.js';
import { UNGROUPED, applyLayout, buildLayout, finishDrag, layoutBuckets, moveItemAcrossContainers, sameLayout, toLayoutPayload } from './layout.js';

const group = (id: string, order: number) => ({ id, title: id, order }) as ChecklistItemGroup;
const item = (id: string, order: number, groupId: string | null) => ({ id, text: id, order, groupId }) as ChecklistItemSummary;

const groups = [group('g2', 1), group('g1', 0)];
const items = [item('a', 0, 'g1'), item('b', 1, 'g1'), item('c', 2, 'g2'), item('d', 3, null), item('e', 4, 'missing')];

describe('checklist layout model (PR 402)', () => {
  it('builds containers in order and puts unknown groups into ungrouped', () => {
    const layout = buildLayout(items, groups);
    expect(layout.groupIds).toEqual(['g1', 'g2']);
    expect(layout.itemsByContainer).toEqual({ [UNGROUPED]: ['d', 'e'], g1: ['a', 'b'], g2: ['c'] });
  });

  it('moves a criterion into another group at the position of the item it hovers', () => {
    const layout = buildLayout(items, groups);
    const moved = moveItemAcrossContainers(layout, 'a', 'c', false);
    expect(moved.itemsByContainer.g1).toEqual(['b']);
    expect(moved.itemsByContainer.g2).toEqual(['a', 'c']);
    expect(moveItemAcrossContainers(layout, 'a', 'c', true).itemsByContainer.g2).toEqual(['c', 'a']);
  });

  it('moves to the end when hovering a group card and ungroups via the ungrouped zone', () => {
    const layout = buildLayout(items, groups);
    expect(moveItemAcrossContainers(layout, 'a', 'g2', false).itemsByContainer.g2).toEqual(['c', 'a']);
    expect(moveItemAcrossContainers(layout, 'a', UNGROUPED, false).itemsByContainer[UNGROUPED]).toEqual(['d', 'e', 'a']);
  });

  it('ignores hovering inside the same container and group drags', () => {
    const layout = buildLayout(items, groups);
    expect(moveItemAcrossContainers(layout, 'a', 'b', false)).toBe(layout);
    expect(moveItemAcrossContainers(layout, 'g1', 'g2', false)).toBe(layout);
  });

  it('finishes a drop by reordering groups or criteria', () => {
    const layout = buildLayout(items, groups);
    expect(finishDrag(layout, 'g1', 'g2').groupIds).toEqual(['g2', 'g1']);
    expect(finishDrag(layout, 'a', 'b').itemsByContainer.g1).toEqual(['b', 'a']);
    expect(finishDrag(layout, 'a', 'a')).toBe(layout);
  });

  it('applies a layout with the same numbering as the server and builds the payload', () => {
    const layout = finishDrag(moveItemAcrossContainers(buildLayout(items, groups), 'a', 'c', false), 'g1', 'g2');
    const applied = applyLayout(items, groups, layout);
    expect(applied.groups.map((g) => [g.id, g.order])).toEqual([['g2', 0], ['g1', 1]]);
    const byId = Object.fromEntries(applied.items.map((i) => [i.id, [i.groupId, i.order]]));
    expect(byId).toEqual({ a: ['g2', 0], c: ['g2', 1], b: ['g1', 2], d: [null, 3], e: [null, 4] });
    expect(toLayoutPayload(layout)).toEqual({
      groups: [{ id: 'g2', itemIds: ['a', 'c'] }, { id: 'g1', itemIds: ['b'] }],
      ungroupedItemIds: ['d', 'e'],
    });
  });

  it('compares layouts and keeps an empty ungrouped bucket for rendering', () => {
    const layout = buildLayout(items, groups);
    expect(sameLayout(layout, buildLayout(items, groups))).toBe(true);
    expect(sameLayout(layout, finishDrag(layout, 'a', 'b'))).toBe(false);
    const emptied = buildLayout([item('a', 0, 'g1')], groups);
    expect(layoutBuckets(emptied, [item('a', 0, 'g1')], groups).map((b) => b.group?.id ?? null)).toEqual(['g1', 'g2', null]);
  });
});
