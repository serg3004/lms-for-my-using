import type { DragEvent } from 'react';

/**
 * PR 580: dragging a row onto a folder, the same in every library (checklists, tests, the next sections).
 * Each library has its own drag type, so a row of one list cannot be dropped into the folders of another.
 */
export function folderDrag(type: string) {
  return {
    start(event: DragEvent, id: string) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(type, id);
    },
    /** Props for a folder (or the root) that accepts a dropped row; `move` gets the row id and the folder id (`null` is the root). */
    drop(targetId: string | null, move: (id: string, target: string | null) => void) {
      return {
        onDragOver(event: DragEvent) {
          if (!event.dataTransfer.types.includes(type)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        },
        onDrop(event: DragEvent) {
          const id = event.dataTransfer.getData(type);
          if (!id) return;
          event.preventDefault();
          move(id, targetId);
        },
      };
    },
  };
}
