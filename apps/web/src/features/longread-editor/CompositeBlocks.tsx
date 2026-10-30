import { useState } from 'react';
import type { TFunction } from 'i18next';
import { TextPreview, ListPreview } from './BlockPreview.js';
import { RichTextEditor } from './RichTextEditor.js';
import {
  addColumn, addItem, addRow, canMergeDown, canMergeRight, cellText, containerDepth, convertItems, deleteColumn, deleteRow, MAX_CONTAINER_DEPTH, MAX_ITEMS,
  MAX_NESTED_BLOCKS, MAX_SLOT_BLOCKS, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, mergeDown, mergeRight, removeItem, setCellText, setColumnCount, setColumnWidth, splitCell, countNested,
  type ColumnsContent, type ItemsContent, type NestedBlock, type TableContent,
} from './composite.js';
import { copyContent, moveItem, newBlock, textBlockTypes, type AddableBlockType, type EditorBlock } from './model.js';

const button = 'admin-btn admin-btn--secondary';
const containers = ['columns', 'tabs', 'accordion'];
const asEditorBlock = (block: NestedBlock): EditorBlock => ({ key: block.id, type: block.type, schemaVersion: block.schemaVersion, title: block.title ?? null, hidden: block.hidden ?? false, content: block.content });

type EditorProps = {
  type: string; content: Record<string, unknown>; t: TFunction; depth?: number;
  onChange: (content: Record<string, unknown>) => void; onConvert?: (type: string, content: Record<string, unknown>) => void;
};

/** PR 384: edits a table, columns, tabs or accordion block. Nested blocks are the same blocks as in a chapter, one level down. */
export function CompositeBlockEditor({ block, t, onChange, onConvert, depth = 1 }: { block: Pick<EditorBlock, 'type' | 'content'> } & Omit<EditorProps, 'type' | 'content'>) {
  const props = { type: block.type, content: block.content, t, onChange, onConvert, depth };
  if (block.type === 'table') return <TableEditor {...props} />;
  if (block.type === 'columns') return <ColumnsEditor {...props} />;
  return <ItemsEditor {...props} />;
}

function TableEditor({ content, t, onChange }: EditorProps) {
  const table = content as unknown as TableContent;
  const [sel, setSel] = useState({ row: 0, column: 0 });
  const row = Math.min(sel.row, table.rows.length - 1), column = Math.min(sel.column, table.columns - 1);
  const cell = table.rows[row]!.cells[column]!;
  const change = (next: TableContent) => onChange(next as unknown as Record<string, unknown>);
  const act = (label: string, next: () => TableContent, disabled = false, moveTo?: { row: number; column: number }) =>
    <button className={button} type="button" disabled={disabled} onClick={() => { change(next()); if (moveTo) setSel(moveTo); }}>{label}</button>;
  const total = table.widths?.reduce((sum, width) => sum + width, 0) ?? table.columns;
  return <div className="lr-table-editor" style={{ maxWidth: '100%' }}>
    <div className="admin-table-actions lr-toolbar" role="group" aria-label={t('longread.composite.tableActions')}>
      {act(t('longread.composite.rowAbove'), () => addRow(table, row), table.rows.length >= MAX_TABLE_ROWS, { row: row + 1, column })}
      {act(t('longread.composite.rowBelow'), () => addRow(table, row + cell.rowSpan), table.rows.length >= MAX_TABLE_ROWS)}
      {act(t('longread.composite.columnLeft'), () => addColumn(table, column), table.columns >= MAX_TABLE_COLUMNS, { row, column: column + 1 })}
      {act(t('longread.composite.columnRight'), () => addColumn(table, column + cell.colSpan), table.columns >= MAX_TABLE_COLUMNS)}
      {act(t('longread.composite.deleteRow'), () => deleteRow(table, row), table.rows.length <= 1, { row: Math.max(0, row - 1), column })}
      {act(t('longread.composite.deleteColumn'), () => deleteColumn(table, column), table.columns <= 1, { row, column: Math.max(0, column - 1) })}
      {act(t('longread.composite.mergeRight'), () => mergeRight(table, row, column), !canMergeRight(table, row, column))}
      {act(t('longread.composite.mergeDown'), () => mergeDown(table, row, column), !canMergeDown(table, row, column))}
      {act(t('longread.composite.split'), () => splitCell(table, row, column), cell.rowSpan === 1 && cell.colSpan === 1)}
    </div>
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
      <input style={{ width: 'auto' }} type="checkbox" checked={table.headerRow} onChange={(event) => change({ ...table, headerRow: event.target.checked })} />
      {t('longread.composite.headerRow')}
    </label>
    <label>{t('longread.composite.columnWidth', { column: column + 1 })}
      <input type="number" min={1} max={100} value={table.widths?.[column] ?? Math.round(100 / table.columns)} onChange={(event) => change(setColumnWidth(table, column, Number(event.target.value) || 1))} />
    </label>
    <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
      <colgroup>{Array.from({ length: table.columns }, (_, index) => <col key={index} style={{ width: `${((table.widths?.[index] ?? 1) / total) * 100}%` }} />)}</colgroup>
      <tbody>{table.rows.map((tableRow, r) => <tr key={r}>{tableRow.cells.map((tableCell, c) => {
        if (tableCell.covered) return null;
        const Tag = table.headerRow && r === 0 ? 'th' : 'td';
        const selected = r === row && c === column;
        return <Tag key={c} scope={Tag === 'th' ? 'col' : undefined} colSpan={tableCell.colSpan} rowSpan={tableCell.rowSpan} style={{ border: `${selected ? 2 : 1}px solid ${selected ? 'var(--color-primary)' : 'var(--color-border, #c5cbd3)'}`, padding: 2, verticalAlign: 'top' }}>
          <textarea style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', fontWeight: Tag === 'th' ? 700 : undefined, overflowWrap: 'anywhere' }} rows={2} maxLength={20_000}
            aria-label={t('longread.composite.cell', { row: r + 1, column: c + 1 })} value={cellText(tableCell)}
            onFocus={() => setSel({ row: r, column: c })} onChange={(event) => change(setCellText(table, r, c, event.target.value))} />
        </Tag>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}

function ItemsEditor({ type, content, t, onChange, onConvert, depth = 1 }: EditorProps) {
  const items = content as unknown as ItemsContent;
  const [active, setActive] = useState(items.items[0]?.id);
  const current = items.items.find((item) => item.id === active) ?? items.items[0]!;
  const change = (next: ItemsContent) => onChange(next as unknown as Record<string, unknown>);
  const update = (id: string, patch: Partial<ItemsContent['items'][number]>) => change({ items: items.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const accordion = type === 'accordion';
  const nameKey = accordion ? 'accordion' : 'tabs';
  const shown = accordion ? items.items : [current];
  return <div className="lr-items-editor">
    <div className="admin-table-actions lr-toolbar" role="group" aria-label={t(`longread.composite.${nameKey}Actions`)}>
      <button className={button} type="button" disabled={items.items.length >= MAX_ITEMS} onClick={() => { const next = addItem(items, t('longread.composite.newItem', { number: items.items.length + 1 })); change(next); setActive(next.items.at(-1)!.id); }}>
        {t(`longread.composite.add${accordion ? 'Section' : 'Tab'}`)}
      </button>
      {onConvert && <button className={button} type="button" onClick={() => onConvert(accordion ? 'tabs' : 'accordion', convertItems(items, accordion ? 'tabs' : 'accordion') as unknown as Record<string, unknown>)}>
        {t(accordion ? 'longread.composite.toTabs' : 'longread.composite.toAccordion')}
      </button>}
    </div>
    {!accordion && <div role="group" aria-label={t('longread.composite.tabList')} className="admin-table-actions lr-toolbar">
      {items.items.map((item, index) => <button key={item.id} type="button" className={button} aria-pressed={item.id === current.id} style={{ borderColor: item.id === current.id ? 'var(--color-primary)' : undefined }} onClick={() => setActive(item.id)}>{index + 1}. {item.title}</button>)}
    </div>}
    {shown.map((item, index) => <section key={item.id} className="lr-item" aria-label={`${t(`longread.types.${nameKey}`)}: ${item.title}`} style={{ borderBlock: '1px solid var(--color-border, #c5cbd3)', paddingBlock: 8 }}>
      <div className="admin-table-actions lr-toolbar">
        <label>{t('longread.composite.itemTitle')}
          <input maxLength={100} value={item.title} aria-invalid={!item.title.trim()} onChange={(event) => update(item.id, { title: event.target.value })} />
        </label>
        <button className={button} type="button" disabled={items.items.indexOf(item) === 0} onClick={() => change({ items: moveItem(items.items, items.items.indexOf(item), -1) })}>{t('longread.up')}</button>
        <button className={button} type="button" disabled={items.items.indexOf(item) === items.items.length - 1} onClick={() => change({ items: moveItem(items.items, items.items.indexOf(item), 1) })}>{t('longread.down')}</button>
        <button className={button} type="button" disabled={items.items.length <= 1} onClick={() => change(removeItem(items, item.id))}>{t('longread.composite.removeItem')}</button>
        {accordion && <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><input style={{ width: 'auto' }} type="checkbox" checked={Boolean(item.open)} onChange={(event) => update(item.id, { open: event.target.checked })} />{t('longread.composite.openByDefault')}</label>}
      </div>
      <Slot name={`${item.title || index + 1}`} blocks={item.blocks} depth={depth} t={t} onChange={(blocks) => update(item.id, { blocks })} />
    </section>)}
  </div>;
}

function ColumnsEditor({ content, t, onChange, depth = 1 }: EditorProps) {
  const columns = content as unknown as ColumnsContent;
  const change = (next: ColumnsContent) => onChange(next as unknown as Record<string, unknown>);
  return <div className="lr-columns-editor">
    <label>{t('longread.composite.columnCount')}
      <select value={columns.count} onChange={(event) => change(setColumnCount(columns, Number(event.target.value) as 2 | 3))}><option value={2}>2</option><option value={3}>3</option></select>
    </label>
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))' }}>
      {columns.columns.map((column, index) => <section key={column.id} aria-label={t('longread.composite.column', { number: index + 1 })} style={{ minWidth: 0 }}>
        <h3>{t('longread.composite.column', { number: index + 1 })}</h3>
        <Slot name={t('longread.composite.column', { number: index + 1 })} blocks={column.blocks} depth={depth} t={t}
          onChange={(blocks) => change({ ...columns, columns: columns.columns.map((item) => item.id === column.id ? { ...item, blocks } : item) })} />
      </section>)}
    </div>
  </div>;
}

/** A list of nested blocks inside a tab, section or column. Only the block being edited runs a rich text editor. */
function Slot({ blocks, onChange, t, depth, name }: { blocks: NestedBlock[]; onChange: (blocks: NestedBlock[]) => void; t: TFunction; depth: number; name: string }) {
  const [active, setActive] = useState<string | null>(null);
  const [type, setType] = useState<AddableBlockType>('paragraph');
  const types = [...textBlockTypes, 'table', ...(depth < MAX_CONTAINER_DEPTH ? containers : [])] as AddableBlockType[];
  const replace = (id: string, patch: (block: NestedBlock) => NestedBlock) => onChange(blocks.map((block) => block.id === id ? patch(block) : block));
  const full = blocks.length >= MAX_SLOT_BLOCKS || countNested(blocks) >= MAX_NESTED_BLOCKS;
  return <div className="lr-slot" role="group" aria-label={name}>
    {!blocks.length && <p>{t('longread.composite.emptySlot')}</p>}
    {blocks.map((block, index) => {
      const known = [...textBlockTypes, 'table', ...containers].includes(block.type);
      const tooDeep = containers.includes(block.type) && depth + containerDepth(block) > MAX_CONTAINER_DEPTH;
      const label = `${index + 1}. ${known ? t(`longread.types.${block.type}`) : t('longread.unknown')}`;
      return <article key={block.id} className="admin-card lr-panel" aria-label={label} style={{ minWidth: 0 }}>
        <div className="admin-table-actions lr-toolbar">
          <button className={button} type="button" aria-pressed={block.id === active} onClick={() => setActive(block.id)}>{label}</button>
          <button className={button} type="button" disabled={index === 0} onClick={() => onChange(moveItem(blocks, index, -1))}>{t('longread.up')}</button>
          <button className={button} type="button" disabled={index === blocks.length - 1} onClick={() => onChange(moveItem(blocks, index, 1))}>{t('longread.down')}</button>
          <button className={button} type="button" disabled={full || tooDeep} onClick={() => onChange([...blocks.slice(0, index + 1), { ...block, id: crypto.randomUUID(), content: copyContent(block.content) as Record<string, unknown> }, ...blocks.slice(index + 1)])}>{t('longread.duplicate')}</button>
          <button className={button} type="button" onClick={() => onChange(blocks.filter((item) => item.id !== block.id))}>{t('longread.delete')}</button>
        </div>
        {!known || tooDeep ? <p>{t('longread.composite.unsupportedNested')}</p>
          : block.type === 'divider' ? <hr />
          : block.type === 'code' ? <textarea style={{ width: '100%', boxSizing: 'border-box' }} className="lr-code" aria-label={t('longread.codeText')} value={String(block.content.code ?? '')} maxLength={50_000} spellCheck={false}
              onFocus={() => setActive(block.id)} onChange={(event) => replace(block.id, (item) => ({ ...item, content: { ...item.content, code: event.target.value } }))} />
          : block.type === 'table' || containers.includes(block.type) ? <CompositeBlockEditor block={block} t={t} depth={depth + 1} onChange={(content) => replace(block.id, (item) => ({ ...item, content }))}
              onConvert={block.type === 'tabs' || block.type === 'accordion' ? (next, content) => replace(block.id, (item) => ({ ...item, type: next, content })) : undefined} />
          : block.id === active ? <RichTextEditor block={asEditorBlock(block)} t={t} onChange={(content) => replace(block.id, (item) => ({ ...item, content }))} />
          : block.type === 'list' ? <ListPreview block={asEditorBlock(block)} /> : <TextPreview block={asEditorBlock(block)} />}
      </article>;
    })}
    <div className="admin-table-actions lr-toolbar">
      <label>{t('longread.composite.nestedType')}
        <select value={type} onChange={(event) => setType(event.target.value as AddableBlockType)}>{types.map((value) => <option key={value} value={value}>{t(`longread.types.${value}`)}</option>)}</select>
      </label>
      <button className={button} type="button" disabled={full} onClick={() => {
        const created = newBlock(type, (number) => t('longread.composite.newItem', { number }));
        onChange([...blocks, { id: created.key, type: created.type, schemaVersion: 1, title: null, hidden: false, content: created.content }]); setActive(created.key);
      }}>{t('longread.composite.addNested')}</button>
    </div>
  </div>;
}
