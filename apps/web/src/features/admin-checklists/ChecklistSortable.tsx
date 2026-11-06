import { useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { plainText } from '@lms/shared/rich-text';
import type { TFunction } from 'i18next';
import type { ChecklistItemGroup, ChecklistItemSummary } from '../../shared/api/types.js';
import { UNGROUPED, buildLayout, finishDrag, layoutBuckets, moveItemAcrossContainers, sameLayout, type Layout, type LayoutBucket } from './layout.js';

// PR 402: mouse, touch and keyboard drag-and-drop of groups and criteria. The ↑/↓ buttons stay as
// the fallback; this layer only supplies the draft layout while a drag is running.

type HandleProps = { ref: (node: HTMLElement | null) => void; [key: string]: unknown };

/** "⋮⋮" grip. Gets the sortable's listeners, so it is the only draggable part (text inputs keep working). */
export function DragHandle({ handle, label }: { handle: HandleProps; label: string }) {
  return <button aria-label={label} className="admin-drag" type="button" {...handle}>⋮⋮</button>;
}

export function SortableBox({ id, className, role, extra, children }: { id: string; className: string; role?: string; /** PR 413: more handlers of the box (the context menu). */ extra?: HTMLAttributes<HTMLDivElement>; children: (handle: HandleProps) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.6, position: 'relative', zIndex: 2, boxShadow: '0 4px 16px rgb(0 0 0 / .2)' } : {}),
  };
  return (
    <div className={className} ref={setNodeRef} role={role} style={style} {...extra}>
      {children({ ref: setActivatorNodeRef, ...attributes, ...listeners })}
    </div>
  );
}

/** The "without a group" card: a plain drop zone, not itself movable. */
export function UngroupedZone({ className, children }: { className: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNGROUPED });
  return <div className={className} ref={setNodeRef} style={isOver ? { outline: '2px dashed var(--color-primary, #2563eb)' } : undefined}>{children}</div>;
}

/** A group card: sortable for real groups, a plain drop zone for the "without a group" bucket. */
export function GroupShell({ groupId, children }: { groupId: string | null; children: (handle: HandleProps | null) => ReactNode }) {
  return groupId
    ? <SortableBox className="admin-group-card" id={groupId}>{children}</SortableBox>
    : <UngroupedZone className="admin-group-card">{children(null)}</UngroupedZone>;
}

export function ItemsSortable({ ids, children }: { ids: string[]; children: ReactNode }) {
  return <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>;
}

type Options = {
  items: ChecklistItemSummary[];
  groups: ChecklistItemGroup[];
  t: TFunction;
  onCommit: (layout: Layout) => void;
};

export function useChecklistLayoutDnd({ items, groups, t, onCommit }: Options) {
  const base = useMemo(() => buildLayout(items, groups), [items, groups]);
  const [draft, setDraftState] = useState<Layout | null>(null);
  // The newest layout of the drag in progress. React may not have rendered the last drag-over yet when the pointer is
  // released (slow device, many editors on the page); the drop must still use it, not the previous render's `draft`.
  const draftRef = useRef<Layout | null>(null);
  const setDraft = (next: Layout | null) => { draftRef.current = next; setDraftState(next); };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const layout = draft ?? base;
  const buckets: LayoutBucket[] = useMemo(() => (draft ? layoutBuckets(draft, items, groups) : []), [draft, items, groups]);
  const groupIdSet = useMemo(() => new Set(groups.map((group) => group.id)), [groups]);

  const nameOf = (id: string) => plainText(groups.find((group) => group.id === id)?.title ?? items.find((item) => item.id === id)?.text ?? '');
  const lastOverId = useRef<string | null>(null);
  // Pointer first, then rectangle overlap (keyboard has no pointer). A hovered group resolves to its
  // nearest criterion so the drop position inside the group is meaningful.
  const collisionDetection: CollisionDetection = (args) => {
    if (groupIdSet.has(String(args.active.id))) {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((container) => groupIdSet.has(String(container.id))) });
    }
    const pointer = pointerWithin(args);
    const hits = pointer.length > 0 ? pointer : rectIntersection(args);
    let overId = getFirstCollision(hits, 'id');
    if (overId != null) {
      const ids = layout.itemsByContainer[String(overId)];
      if (ids && ids.length > 0) {
        const nearest = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((container) => ids.includes(String(container.id))) });
        overId = nearest[0]?.id ?? overId;
      }
      lastOverId.current = String(overId);
      return [{ id: overId }];
    }
    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  };

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const rect = active.rect.current.translated;
    const below = rect != null && rect.top > over.rect.top + over.rect.height / 2;
    setDraft(moveItemAcrossContainers(draftRef.current ?? base, String(active.id), String(over.id), below));
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    const current = draftRef.current ?? base;
    const final = over ? finishDrag(current, String(active.id), String(over.id)) : current;
    setDraft(null);
    if (!sameLayout(final, base)) onCommit(final);
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => t('admin.checklists.dnd.picked', 'Picked up {{name}}.', { name: nameOf(String(active.id)) }),
    onDragOver: ({ active, over }) => (over ? t('admin.checklists.dnd.over', '{{name}} is over {{target}}.', { name: nameOf(String(active.id)), target: over.id === UNGROUPED ? t('admin.checklists.ungroupedItems', 'Ungrouped') : nameOf(String(over.id)) }) : undefined),
    onDragEnd: ({ active }) => t('admin.checklists.dnd.dropped', '{{name}} was moved.', { name: nameOf(String(active.id)) }),
    onDragCancel: ({ active }) => t('admin.checklists.dnd.cancelled', 'Moving {{name}} was cancelled.', { name: nameOf(String(active.id)) }),
  };

  const dndProps = {
    sensors,
    collisionDetection,
    onDragStart: () => { lastOverId.current = null; setDraft(base); },
    onDragOver,
    onDragEnd,
    onDragCancel: () => setDraft(null),
    accessibility: {
      announcements,
      screenReaderInstructions: {
        draggable: t('admin.checklists.dnd.instructions', 'To pick up, press space or enter. Move with the arrow keys, drop with space or enter, cancel with escape.'),
      },
    },
  };

  return { dndProps, dragging: draft !== null, buckets, layout };
}

type FlatOptions = {
  /** One entry per row, in screen order; the dnd id of a row is its entry. */
  ids: string[];
  nameOf: (id: string) => string;
  onMove: (fromIndex: number, toIndex: number) => void;
  t: TFunction;
};

/** PR 418: mouse, touch and keyboard drag-and-drop for a flat list (fields of "General information", scale levels): no groups, no draft layout. */
export function useFlatListDnd({ ids, nameOf, onMove, t }: FlatOptions) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('admin.checklists.dnd.picked', 'Picked up {{name}}.', { name: nameOf(String(active.id)) }),
    onDragOver: ({ active, over }) => (over ? t('admin.checklists.dnd.over', '{{name}} is over {{target}}.', { name: nameOf(String(active.id)), target: nameOf(String(over.id)) }) : undefined),
    onDragEnd: ({ active }) => t('admin.checklists.dnd.dropped', '{{name}} was moved.', { name: nameOf(String(active.id)) }),
    onDragCancel: ({ active }) => t('admin.checklists.dnd.cancelled', 'Moving {{name}} was cancelled.', { name: nameOf(String(active.id)) }),
  };
  return {
    sensors,
    collisionDetection: closestCenter,
    onDragEnd: ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      onMove(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    },
    accessibility: {
      announcements,
      screenReaderInstructions: {
        draggable: t('admin.checklists.dnd.instructions', 'To pick up, press space or enter. Move with the arrow keys, drop with space or enter, cancel with escape.'),
      },
    },
  };
}

export { DndContext, SortableContext };
