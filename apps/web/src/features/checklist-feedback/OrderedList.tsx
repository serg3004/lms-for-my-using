import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SortableBox, DragHandle } from '../admin-checklists/ChecklistSortable.js';
import { Button } from '../../shared/ui.js';
export function OrderedList<T extends { id: string }>({ items, onChange, children }: { items: T[]; onChange: (items: T[]) => void; children: (item: T, index: number) => ReactNode }) {
  const { t } = useTranslation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const name = (id: string | number) => t('feedbackBuilder.item', { number: items.findIndex((item) => item.id === id) + 1 });
  function move(from: number, to: number) { if (to >= 0 && to < items.length) onChange(arrayMove(items, from, to)); }
  return <DndContext accessibility={{
    screenReaderInstructions: { draggable: t('admin.checklists.dnd.instructions') },
    announcements: {
      onDragStart: ({ active }) => t('admin.checklists.dnd.picked', { name: name(active.id) }),
      onDragOver: ({ active, over }) => over ? t('admin.checklists.dnd.over', { name: name(active.id), target: name(over.id) }) : undefined,
      onDragEnd: ({ active }) => t('admin.checklists.dnd.dropped', { name: name(active.id) }),
      onDragCancel: ({ active }) => t('admin.checklists.dnd.cancelled', { name: name(active.id) }),
    },
  }} sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over && active.id !== over.id) move(items.findIndex((item) => item.id === active.id), items.findIndex((item) => item.id === over.id)); }}>
    <SortableContext items={items.map(({ id }) => id)} strategy={verticalListSortingStrategy}><div style={{ display: 'grid', gap: 12 }}>{items.map((item, index) => <SortableBox key={item.id} id={item.id} className="feedback-sortable">{(handle) => <div style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}><DragHandle handle={handle} label={t('feedbackBuilder.drag', { number: index + 1 })} /><Button type="button" variant="secondary" disabled={index === 0} aria-label={t('feedbackBuilder.up', { number: index + 1 })} onClick={() => move(index, index - 1)}>↑</Button><Button type="button" variant="secondary" disabled={index === items.length - 1} aria-label={t('feedbackBuilder.down', { number: index + 1 })} onClick={() => move(index, index + 1)}>↓</Button></div>
      {children(item, index)}
    </div>}</SortableBox>)}</div></SortableContext>
  </DndContext>;
}
