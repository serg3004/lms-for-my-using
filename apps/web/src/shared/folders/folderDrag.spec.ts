import type { DragEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { folderDrag } from './folderDrag.js';

function dragEvent(types: string[], data: Record<string, string> = {}) {
  const store = { ...data };
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      types,
      effectAllowed: '',
      dropEffect: '',
      setData: (type: string, value: string) => { store[type] = value; },
      getData: (type: string) => store[type] ?? '',
    },
  } as unknown as DragEvent & { dataTransfer: { effectAllowed: string; dropEffect: string } };
}

describe('folderDrag (PR 580)', () => {
  const drag = folderDrag('application/x-test-row');

  it('moves the dragged row into the folder it is dropped on', () => {
    const move = vi.fn();
    const start = dragEvent([]);
    drag.start(start, 'row-1');
    expect(start.dataTransfer.effectAllowed).toBe('move');
    const drop = dragEvent(['application/x-test-row'], { 'application/x-test-row': 'row-1' });
    drag.drop('folder-1', move).onDrop(drop);
    expect(move).toHaveBeenCalledWith('row-1', 'folder-1');
    expect(drop.preventDefault).toHaveBeenCalled();
  });

  it('accepts the root as a target', () => {
    const move = vi.fn();
    drag.drop(null, move).onDrop(dragEvent(['application/x-test-row'], { 'application/x-test-row': 'row-2' }));
    expect(move).toHaveBeenCalledWith('row-2', null);
  });

  it('ignores a drag of another list and an empty drop', () => {
    const move = vi.fn();
    const target = drag.drop('folder-1', move);
    const foreign = dragEvent(['application/x-other']);
    target.onDragOver(foreign);
    expect(foreign.preventDefault).not.toHaveBeenCalled();
    target.onDrop(dragEvent(['application/x-other']));
    expect(move).not.toHaveBeenCalled();
  });
});
