import { describe, expect, it } from 'vitest';
import {
  addColumn, addRow, canMergeDown, canMergeRight, cellText, containerDepth, convertItems, deleteColumn, deleteRow, emptyTable, mergeDown, mergeRight,
  setCellText, setColumnCount, splitCell, tableValid, type ItemsContent, type NestedBlock, type TableContent,
} from './composite.js';

const texts = (table: TableContent) => table.rows.map((row) => row.cells.map(cellText));
function filled(): TableContent {
  let table = emptyTable(3, 3);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) table = setCellText(table, r, c, `${r}${c}`);
  return table;
}
const nested = (id: string, type = 'paragraph', content: Record<string, unknown> = { runs: [] }): NestedBlock => ({ id, type, schemaVersion: 1, content });

describe('table operations (PR 384)', () => {
  it('3x3 table with an added row and column, a merge and a split keeps every text', () => {
    let table = addColumn(addRow(filled(), 3), 3);
    expect(table.rows).toHaveLength(4);
    expect(table.columns).toBe(4);
    table = setCellText(table, 3, 3, 'new');
    table = mergeRight(mergeRight(table, 1, 0), 0, 0);
    expect(cellText(table.rows[0]!.cells[0]!)).toBe('00 01');
    expect(table.rows[0]!.cells[0]!.colSpan).toBe(2);
    expect(table.rows[0]!.cells[1]!.covered).toBe(true);
    table = mergeDown(table, 0, 0);
    expect(cellText(table.rows[0]!.cells[0]!)).toBe('00 01 10 11');
    expect(tableValid(table)).toBe(true);
    table = splitCell(table, 0, 0);
    expect(tableValid(table)).toBe(true);
    expect(texts(table)[0]![0]).toBe('00 01 10 11');
    expect(texts(table)[3]![3]).toBe('new');
    expect(table.rows.flatMap((row) => row.cells).some((cell) => cell.covered)).toBe(false);
  });

  it('refuses merges that would cross a merged area and keeps the table valid', () => {
    const merged = mergeRight(filled(), 0, 0);
    expect(canMergeRight(merged, 0, 0)).toBe(true);
    expect(canMergeDown(merged, 0, 0)).toBe(false); // the cell below is narrower
    expect(canMergeRight(filled(), 0, 2)).toBe(false);
    expect(mergeDown(merged, 0, 0)).toEqual(merged);
  });

  it('structure changes through a merged cell split it first and never leave orphan covers', () => {
    const merged = mergeDown(mergeRight(mergeRight(filled(), 1, 0), 0, 0), 0, 0);
    for (const changed of [addRow(merged, 1), addColumn(merged, 1), deleteRow(merged, 1), deleteColumn(merged, 1), deleteRow(merged, 0), deleteColumn(merged, 0)]) {
      expect(tableValid(changed)).toBe(true);
    }
    expect(texts(deleteRow(merged, 1))[0]![0]).toBe('00 01 10 11');
    expect(deleteRow(emptyTable(1, 1), 0).rows).toHaveLength(1);
    expect(deleteColumn(emptyTable(1, 1), 0).columns).toBe(1);
  });

  it('widths follow added and deleted columns', () => {
    let table: TableContent = { ...emptyTable(1, 2), widths: [30, 70] };
    table = addColumn(table, 1);
    expect(table.widths).toHaveLength(3);
    expect(deleteColumn(table, 0).widths).toHaveLength(2);
  });
});

describe('items and columns (PR 384)', () => {
  const tabs: ItemsContent = { items: [
    { id: 'a', title: 'One', blocks: [nested('1'), nested('2')] },
    { id: 'b', title: 'Two', blocks: [nested('3', 'note', { runs: [], tone: 'info' })] },
  ] };

  it('tabs -> accordion -> tabs keeps order, titles, ids and nested blocks', () => {
    const back = convertItems(convertItems(tabs, 'accordion'), 'tabs');
    expect(back).toEqual(tabs);
    expect(convertItems(tabs, 'accordion').items.every((item) => item.open === false)).toBe(true);
  });

  it('three columns become two without dropping blocks', () => {
    const three = { count: 3 as const, columns: [{ id: 'x', blocks: [nested('1')] }, { id: 'y', blocks: [nested('2')] }, { id: 'z', blocks: [nested('3')] }] };
    const two = setColumnCount(three, 2);
    expect(two.columns.map((column) => column.blocks.map((block) => block.id))).toEqual([['1'], ['2', '3']]);
    expect(setColumnCount(two, 3).columns).toHaveLength(3);
  });

  it('counts the depth of nested containers', () => {
    const inner = nested('i', 'tabs', { items: [{ id: 'p', title: 'T', blocks: [nested('c')] }] });
    expect(containerDepth(nested('o', 'accordion', { items: [{ id: 'q', title: 'T', blocks: [inner] }] }))).toBe(2);
    expect(containerDepth(nested('plain'))).toBe(0);
  });
});
