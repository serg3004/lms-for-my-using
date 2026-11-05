import { describe, expect, it } from 'vitest';
import { checklistLabel, checklistNumbers } from './checklist-numbering.js';

describe('checklist numbering', () => {
  it('defaults to enabled and hides only generated prefixes, keeping author numbers', () => {
    expect(checklistLabel('7. Author title', '1.2')).toBe('1.2 7. Author title');
    expect(checklistLabel('7. Author title', '1.2', false)).toBe('7. Author title');
    expect(checklistLabel('Title', '')).toBe('Title');
  });
  it('uses group and criterion order, skips empty groups and handles ungrouped or deleted groups', () => {
    const items = [{ id: 'b', groupId: 'g2', order: 2 }, { id: 'a2', groupId: 'g1', order: 1 }, { id: 'a1', groupId: 'g1', order: 0 }, { id: 'u', groupId: null, order: 3 }, { id: 'orphan', groupId: 'missing', order: 4 }];
    const groups = [{ id: 'g2', order: 2 }, { id: 'empty', order: 0 }, { id: 'g1', order: 1 }];
    const result = checklistNumbers(items, groups);
    expect([...result.groupNumbers]).toEqual([['g1', '1'], ['g2', '2']]);
    expect([...result.itemNumbers]).toEqual([['a1', '1.1'], ['a2', '1.2'], ['b', '2.1'], ['u', '1'], ['orphan', '2']]);
    expect(items[0].id).toBe('b');
  });
});
