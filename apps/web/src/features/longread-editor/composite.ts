import type { Run } from './model.js';

/** PR 384: pure operations on the composite blocks (table, columns, tabs, accordion). The server re-validates everything. */
export type TableCell = { runs: Run[]; colSpan: number; rowSpan: number; covered: boolean };
export type TableContent = { columns: number; widths?: number[]; headerRow: boolean; rows: { cells: TableCell[] }[] };
export type NestedBlock = { id: string; type: string; schemaVersion: number; title?: string | null; hidden?: boolean; content: Record<string, unknown> };
export type BlockItem = { id: string; title: string; open?: boolean; blocks: NestedBlock[] };
export type ItemsContent = { items: BlockItem[] };
export type ColumnsContent = { count: 2 | 3; columns: { id: string; blocks: NestedBlock[] }[] };

export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 12;
export const MAX_ITEMS = 12;
export const MAX_SLOT_BLOCKS = 50;
export const MAX_NESTED_BLOCKS = 200;
export const MAX_CONTAINER_DEPTH = 3;

const blankCell = (): TableCell => ({ runs: [], colSpan: 1, rowSpan: 1, covered: false });
const cloneTable = (table: TableContent): TableContent => structuredClone(table);

export function emptyTable(rows = 3, columns = 3): TableContent {
  return { columns, headerRow: false, rows: Array.from({ length: rows }, () => ({ cells: Array.from({ length: columns }, blankCell) })) };
}

export const cellText = (cell: TableCell) => cell.runs.map((run) => run.text).join('');

/** Table cells are plain text in this release; the text is written back as one run. */
export function setCellText(table: TableContent, row: number, column: number, text: string): TableContent {
  const next = cloneTable(table);
  next.rows[row]!.cells[column]!.runs = text ? [{ text: text.slice(0, 20_000) }] : [];
  return next;
}

/** Undoes one merge: the origin cell keeps its text, the cells it covered become empty ordinary cells. */
export function splitCell(table: TableContent, row: number, column: number): TableContent {
  const next = cloneTable(table);
  const origin = next.rows[row]!.cells[column]!;
  for (let r = row; r < row + origin.rowSpan; r++) for (let c = column; c < column + origin.colSpan; c++) {
    if (r !== row || c !== column) next.rows[r]!.cells[c] = blankCell();
  }
  origin.rowSpan = 1; origin.colSpan = 1;
  return next;
}

/** Splits every merged cell whose area crosses the given row or column line, so a structural change never orphans a cover. */
function splitCrossing(table: TableContent, test: (row: number, column: number, cell: TableCell) => boolean): TableContent {
  let next = table;
  table.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
    if (!cell.covered && (cell.rowSpan > 1 || cell.colSpan > 1) && test(r, c, cell)) next = splitCell(next, r, c);
  }));
  return next;
}

export function addRow(table: TableContent, at: number): TableContent {
  if (table.rows.length >= MAX_TABLE_ROWS) return table;
  const next = cloneTable(splitCrossing(table, (r, _c, cell) => r < at && r + cell.rowSpan > at));
  next.rows.splice(at, 0, { cells: Array.from({ length: next.columns }, blankCell) });
  return next;
}

export function addColumn(table: TableContent, at: number): TableContent {
  if (table.columns >= MAX_TABLE_COLUMNS) return table;
  const next = cloneTable(splitCrossing(table, (_r, c, cell) => c < at && c + cell.colSpan > at));
  next.rows.forEach((row) => row.cells.splice(at, 0, blankCell()));
  if (next.widths) next.widths.splice(at, 0, Math.max(1, Math.round(next.widths.reduce((sum, w) => sum + w, 0) / next.widths.length)));
  next.columns += 1;
  return next;
}

export function deleteRow(table: TableContent, index: number): TableContent {
  if (table.rows.length <= 1) return table;
  const next = cloneTable(splitCrossing(table, (r, _c, cell) => r <= index && r + cell.rowSpan > index));
  next.rows.splice(index, 1);
  return next;
}

export function deleteColumn(table: TableContent, index: number): TableContent {
  if (table.columns <= 1) return table;
  const next = cloneTable(splitCrossing(table, (_r, c, cell) => c <= index && c + cell.colSpan > index));
  next.rows.forEach((row) => row.cells.splice(index, 1));
  next.widths?.splice(index, 1);
  next.columns -= 1;
  return next;
}

export function setColumnWidth(table: TableContent, column: number, width: number): TableContent {
  const next = cloneTable(table);
  const widths = next.widths ?? Array.from({ length: next.columns }, () => 10);
  widths[column] = Math.min(100, Math.max(1, Math.round(width)));
  next.widths = widths;
  return next;
}

export function canMergeRight(table: TableContent, row: number, column: number): boolean {
  const origin = table.rows[row]?.cells[column];
  const neighbour = origin && !origin.covered ? table.rows[row]!.cells[column + origin.colSpan] : undefined;
  return !!neighbour && !neighbour.covered && neighbour.rowSpan === origin!.rowSpan;
}

export function canMergeDown(table: TableContent, row: number, column: number): boolean {
  const origin = table.rows[row]?.cells[column];
  const neighbour = origin && !origin.covered ? table.rows[row + origin.rowSpan]?.cells[column] : undefined;
  return !!neighbour && !neighbour.covered && neighbour.colSpan === origin!.colSpan;
}

function join(a: Run[], b: Run[]): Run[] {
  return a.length && b.length ? [...a, { text: ' ' }, ...b] : [...a, ...b];
}

function cover(next: TableContent, row: number, column: number, rowSpan: number, columnSpan: number) {
  for (let r = row; r < row + rowSpan; r++) for (let c = column; c < column + columnSpan; c++) {
    next.rows[r]!.cells[c] = { runs: [], colSpan: 1, rowSpan: 1, covered: true };
  }
}

/** Merges the cell with its right neighbour; the neighbour's text moves into the merged cell instead of vanishing. */
export function mergeRight(table: TableContent, row: number, column: number): TableContent {
  if (!canMergeRight(table, row, column)) return table;
  const next = cloneTable(table);
  const origin = next.rows[row]!.cells[column]!;
  const neighbour = next.rows[row]!.cells[column + origin.colSpan]!;
  origin.runs = join(origin.runs, neighbour.runs);
  cover(next, row, column + origin.colSpan, neighbour.rowSpan, neighbour.colSpan);
  origin.colSpan += neighbour.colSpan;
  return next;
}

export function mergeDown(table: TableContent, row: number, column: number): TableContent {
  if (!canMergeDown(table, row, column)) return table;
  const next = cloneTable(table);
  const origin = next.rows[row]!.cells[column]!;
  const neighbour = next.rows[row + origin.rowSpan]!.cells[column]!;
  origin.runs = join(origin.runs, neighbour.runs);
  cover(next, row + origin.rowSpan, column, neighbour.rowSpan, neighbour.colSpan);
  origin.rowSpan += neighbour.rowSpan;
  return next;
}

/** The same rules the server enforces, so the editor can refuse to save what would be rejected. */
export function tableValid(table: TableContent): boolean {
  if (!(table.columns >= 1 && table.columns <= MAX_TABLE_COLUMNS) || table.rows.length < 1 || table.rows.length > MAX_TABLE_ROWS) return false;
  if (table.widths && table.widths.length !== table.columns) return false;
  if (table.rows.some((row) => row.cells.length !== table.columns)) return false;
  const owned = table.rows.map((row) => row.cells.map(() => false));
  for (const [r, row] of table.rows.entries()) for (const [c, cell] of row.cells.entries()) {
    if (cell.covered) continue;
    if (r + cell.rowSpan > table.rows.length || c + cell.colSpan > table.columns) return false;
    for (let dr = 0; dr < cell.rowSpan; dr++) for (let dc = 0; dc < cell.colSpan; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (owned[r + dr]![c + dc]) return false;
      owned[r + dr]![c + dc] = true;
    }
  }
  return table.rows.every((row, r) => row.cells.every((cell, c) => cell.covered === owned[r]![c] && (!cell.covered || (cell.runs.length === 0 && cell.rowSpan === 1 && cell.colSpan === 1))));
}

/** Tabs and accordion share one shape, so converting only changes the block type (and the accordion-only `open` flag). */
export function convertItems(content: ItemsContent, to: 'tabs' | 'accordion'): ItemsContent {
  return { items: content.items.map((item) => {
    const copy = { ...item };
    delete copy.open;
    return to === 'accordion' ? { ...copy, open: false } : copy;
  }) };
}

export function addItem(content: ItemsContent, title: string): ItemsContent {
  if (content.items.length >= MAX_ITEMS) return content;
  return { items: [...content.items, { id: crypto.randomUUID(), title, blocks: [] }] };
}

export function removeItem(content: ItemsContent, id: string): ItemsContent {
  return content.items.length <= 1 ? content : { items: content.items.filter((item) => item.id !== id) };
}

/** Three columns become two without losing anything: the third column's blocks follow the second column's. */
export function setColumnCount(content: ColumnsContent, count: 2 | 3): ColumnsContent {
  if (content.count === count) return content;
  if (count === 3) return { count, columns: [...content.columns, { id: crypto.randomUUID(), blocks: [] }] };
  const [first, second, third] = content.columns;
  return { count, columns: [first!, { ...second!, blocks: [...second!.blocks, ...(third?.blocks ?? [])] }] };
}

export function countNested(blocks: NestedBlock[]): number {
  return blocks.reduce((sum, block) => sum + 1 + slotsOf(block).reduce((inner, slot) => inner + countNested(slot), 0), 0);
}

/** Child block lists of a nested block, whatever container it is. */
export function slotsOf(block: Pick<NestedBlock, 'type' | 'content'>): NestedBlock[][] {
  if (block.type === 'columns') return ((block.content as unknown as ColumnsContent).columns ?? []).map((column) => column.blocks);
  if (block.type === 'tabs' || block.type === 'accordion') return ((block.content as unknown as ItemsContent).items ?? []).map((item) => item.blocks);
  return [];
}

/** Depth of containers inside a block (a plain block is 0). */
export function containerDepth(block: Pick<NestedBlock, 'type' | 'content'>): number {
  const slots = slotsOf(block);
  if (!['columns', 'tabs', 'accordion'].includes(block.type)) return 0;
  return 1 + Math.max(0, ...slots.flat().map(containerDepth));
}
