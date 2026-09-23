import { describe, expect, it } from 'vitest';

import {
  appendContextField,
  applyContextFieldPatch,
  applyGroupPatch,
  groupItems,
  moveGroup,
  removeContextFieldById,
} from './domain.js';
import type { ChecklistItemGroup, ChecklistItemSummary, ContextField } from '../../shared/api/types.js';

function item(overrides: Partial<ChecklistItemSummary>): ChecklistItemSummary {
  return { id: 'item-1', checklistId: 'checklist-1', order: 0, text: 'Criterion', points: 0, isRequired: true, photoRequired: false, ...overrides };
}

function group(overrides: Partial<ChecklistItemGroup>): ChecklistItemGroup {
  return { id: 'group-1', checklistId: 'checklist-1', title: 'Group', order: 0, ...overrides };
}

describe('groupItems', () => {
  it('buckets items under their group, ordered by group.order', () => {
    const groups = [group({ id: 'g-2', title: 'Closing', order: 1 }), group({ id: 'g-1', title: 'Opening', order: 0 })];
    const items = [
      item({ id: 'i-1', groupId: 'g-1' }),
      item({ id: 'i-2', groupId: 'g-2' }),
      item({ id: 'i-3', groupId: 'g-1' }),
    ];
    const buckets = groupItems(items, groups);
    expect(buckets.map((b) => b.group?.title)).toEqual(['Opening', 'Closing']);
    expect(buckets[0].items.map((i) => i.id)).toEqual(['i-1', 'i-3']);
    expect(buckets[1].items.map((i) => i.id)).toEqual(['i-2']);
  });

  it('puts ungrouped items (null groupId) in a trailing null-group bucket', () => {
    const groups = [group({ id: 'g-1' })];
    const items = [item({ id: 'i-1', groupId: 'g-1' }), item({ id: 'i-2', groupId: null })];
    const buckets = groupItems(items, groups);
    expect(buckets).toHaveLength(2);
    expect(buckets[1].group).toBeNull();
    expect(buckets[1].items.map((i) => i.id)).toEqual(['i-2']);
  });

  it('also treats a dangling groupId (group no longer exists) as ungrouped', () => {
    const items = [item({ id: 'i-1', groupId: 'missing-group' })];
    const buckets = groupItems(items, []);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].group).toBeNull();
    expect(buckets[0].items.map((i) => i.id)).toEqual(['i-1']);
  });

  it('omits the ungrouped bucket entirely when there are groups and every item belongs to one', () => {
    const groups = [group({ id: 'g-1' })];
    const items = [item({ id: 'i-1', groupId: 'g-1' })];
    expect(groupItems(items, groups)).toHaveLength(1);
  });
});

describe('applyGroupPatch', () => {
  it('renames only the matching group', () => {
    const groups = [group({ id: 'g-1', title: 'A' }), group({ id: 'g-2', title: 'B' })];
    const patched = applyGroupPatch(groups, 'g-1', { title: 'Renamed' });
    expect(patched.map((g) => g.title)).toEqual(['Renamed', 'B']);
  });
});

describe('moveGroup', () => {
  const groups = [group({ id: 'g-1', order: 0 }), group({ id: 'g-2', order: 1 }), group({ id: 'g-3', order: 2 })];

  it('swaps order with the previous group when moving up', () => {
    expect(moveGroup(groups, 'g-2', 'up')).toEqual([{ id: 'g-2', order: 0 }, { id: 'g-1', order: 1 }]);
  });

  it('swaps order with the next group when moving down', () => {
    expect(moveGroup(groups, 'g-2', 'down')).toEqual([{ id: 'g-2', order: 2 }, { id: 'g-3', order: 1 }]);
  });

  it('is a no-op at the top/bottom edge', () => {
    expect(moveGroup(groups, 'g-1', 'up')).toEqual([]);
    expect(moveGroup(groups, 'g-3', 'down')).toEqual([]);
  });
});

describe('context field helpers', () => {
  const field: ContextField = { id: 'f-1', label: 'Store', type: 'text', required: true, order: 0 };

  it('appendContextField adds a new blank field ordered after the last one', () => {
    const fields = appendContextField([field]);
    expect(fields).toHaveLength(2);
    expect(fields[1]).toMatchObject({ label: '', type: 'text', required: false, order: 1 });
    expect(fields[1].id).not.toBe(field.id);
  });

  it('applyContextFieldPatch merges a patch into the matching field only', () => {
    const other: ContextField = { id: 'f-2', label: 'Shift', type: 'textarea', required: false, order: 1 };
    const patched = applyContextFieldPatch([field, other], 'f-1', { label: 'Store number' });
    expect(patched).toEqual([{ ...field, label: 'Store number' }, other]);
  });

  it('removeContextFieldById drops only the matching field', () => {
    const other: ContextField = { id: 'f-2', label: 'Shift', type: 'textarea', required: false, order: 1 };
    expect(removeContextFieldById([field, other], 'f-1')).toEqual([other]);
  });
});
