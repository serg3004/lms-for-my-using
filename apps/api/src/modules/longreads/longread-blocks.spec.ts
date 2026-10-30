import { isKnownBlockType, validateBlockContent } from './longread-blocks.js';
import { remapContentIds } from './longreads.service.js';

const ok = (type: string, content: unknown, blockId?: string) => validateBlockContent(type, content, blockId);

describe('longread block registry (PR 381)', () => {
  it('accepts a paragraph with formatted runs and safe links', () => {
    const result = ok('paragraph', { runs: [{ text: 'Hi ', bold: true }, { text: 'site', href: 'https://example.com/a' }, { text: 'jump', href: '#ch-1' }] });
    expect(result).toMatchObject({ ok: true, known: true });
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', ' https://a.b'])('rejects unsafe href %s', (href) => {
    expect(ok('paragraph', { runs: [{ text: 'x', href }] }).ok).toBe(false);
  });

  it('limits heading level and rejects a list level jump', () => {
    expect(ok('heading', { level: 4, runs: [{ text: 'x' }] }).ok).toBe(false);
    expect(ok('list', { ordered: false, items: [{ level: 1, runs: [{ text: 'a' }] }, { level: 3, runs: [{ text: 'b' }] }] }).ok).toBe(false);
    expect(ok('list', { ordered: true, items: [{ level: 1, runs: [{ text: 'a' }] }, { level: 2, runs: [{ text: 'b' }] }] }).ok).toBe(true);
  });

  it('rejects unknown keys of a known block and non-object content', () => {
    expect(ok('divider', { evil: true }).ok).toBe(false);
    expect(ok('paragraph', 'text').ok).toBe(false);
    expect(ok('paragraph', [])).toMatchObject({ ok: false });
  });

  it('rejects active HTML fields while treating code/markup only as inert text data', () => {
    expect(ok('paragraph', { html: '<script>alert(1)</script>', runs: [] }).ok).toBe(false);
    expect(ok('paragraph', { runs: [{ text: 'Hi', onerror: 'alert(1)' }] }).ok).toBe(false);
    expect(ok('code', { language: 'html', code: '<script>alert(1)</script>' })).toMatchObject({ ok: true, content: { code: '<script>alert(1)</script>' } });
    expect(ok('list', { items: [{ level: 1, runs: [] }, { level: 2, runs: [] }, { level: 3, runs: [] }, { level: 4, runs: [] }] }).ok).toBe(false);
  });

  it('keeps blocks of an unknown type as they are, but caps their size', () => {
    expect(isKnownBlockType('future_widget')).toBe(false);
    expect(ok('future_widget', { a: 1 })).toEqual({ ok: true, content: { a: 1 }, known: false });
    expect(ok('future_widget', { blob: 'x'.repeat(100_001) }).ok).toBe(false);
  });
});

describe('remapContentIds', () => {
  it('gives every uuid id a new value consistently and leaves other fields alone', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const content = { id, title: 'T', items: [{ id, text: 'a' }, { id: 'not-a-uuid', n: 1 }] };
    const copy = remapContentIds(content) as typeof content;
    expect(copy.id).not.toBe(id);
    expect(copy.items[0]!.id).toBe(copy.id);
    expect(copy.items[1]!.id).toBe('not-a-uuid');
    expect(copy.title).toBe('T');
    expect(content.id).toBe(id);
  });
});

describe('composite blocks (PR 384)', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const text = (n: number, value = 't') => ({ id: id(n), type: 'paragraph', schemaVersion: 1, content: { runs: [{ text: value }] } });
  const cell = (value = '', extra: object = {}) => ({ runs: value ? [{ text: value }] : [], ...extra });
  const table = (rows: object[][], extra: object = {}) => ({ columns: rows[0]!.length, rows: rows.map((cells) => ({ cells })), ...extra });

  it('accepts a table, applies defaults and keeps text of merged cells in the origin cell', () => {
    const result = ok('table', table([[cell('a', { colSpan: 2 }), cell('', { covered: true })], [cell('c'), cell('d')]], { headerRow: true, widths: [30, 70] }));
    expect(result).toMatchObject({ ok: true, known: true });
    expect((result as { content: { rows: { cells: { rowSpan: number }[] }[] } }).content.rows[1]!.cells[0]!.rowSpan).toBe(1);
  });

  it.each([
    ['ragged rows', table([[cell(), cell()], [cell()]]), 'Every row'],
    ['text inside a covered cell', table([[cell('a', { colSpan: 2 }), cell('lost', { covered: true })]]), 'must be empty'],
    ['span that is not marked covered', table([[cell('a', { colSpan: 2 }), cell('b')]]), 'must be marked covered'],
    ['covered cell outside any merge', table([[cell('a'), cell('', { covered: true })]]), 'not inside a merged cell'],
    ['span outside the table', table([[cell('a', { colSpan: 3 }), cell()]]), 'does not fit'],
    ['overlapping merges', table([[cell('a', { colSpan: 2, rowSpan: 2 }), cell('', { covered: true })], [cell('', { covered: true }), cell('', { covered: true })], [cell('b', { colSpan: 2, rowSpan: 2 }), cell('', { covered: true })]]), 'does not fit'],
    ['widths of wrong length', table([[cell(), cell()]], { widths: [100] }), 'one value per column'],
  ])('rejects %s', (_name, content, message) => {
    const result = ok('table', content);
    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).toContain(message);
  });

  it('accepts tabs, accordion and columns with nested blocks, and tabs/accordion share one shape', () => {
    const items = { items: [{ id: id(1), title: 'One', blocks: [text(2)] }, { id: id(3), title: 'Two', blocks: [text(4, 'x')] }] };
    expect(ok('tabs', items)).toMatchObject({ ok: true });
    expect(ok('accordion', items)).toMatchObject({ ok: true });
    expect(ok('columns', { count: 2, columns: [{ id: id(5), blocks: [text(6)] }, { id: id(7), blocks: [] }] })).toMatchObject({ ok: true });
    expect(ok('columns', { count: 3, columns: [{ id: id(5), blocks: [] }, { id: id(7), blocks: [] }] }).ok).toBe(false);
    expect(ok('tabs', { items: [] }).ok).toBe(false);
  });

  it('rejects duplicate ids, a block that contains itself and non-nestable or invalid children', () => {
    const dup = ok('tabs', { items: [{ id: id(1), title: 'A', blocks: [text(2)] }, { id: id(3), title: 'B', blocks: [text(2)] }] });
    expect(dup).toMatchObject({ ok: false });
    expect((dup as { message: string }).message).toContain('duplicate id');
    const self = ok('tabs', { items: [{ id: id(1), title: 'A', blocks: [text(9)] }] }, id(9));
    expect((self as { message: string }).message).toContain('cannot contain itself');
    expect(ok('tabs', { items: [{ id: id(1), title: 'A', blocks: [{ ...text(2), type: 'future_widget' }] }] }).ok).toBe(false);
    expect(ok('tabs', { items: [{ id: id(1), title: 'A', blocks: [{ ...text(2), content: { runs: [{ text: 'x', href: 'javascript:1' }] } }] }] }).ok).toBe(false);
  });

  it('limits nesting to 3 levels', () => {
    const level = (n: number, inner: object[]) => ({ id: id(n), type: 'tabs', schemaVersion: 1, content: { items: [{ id: id(n + 50), title: 'T', blocks: inner }] } });
    const four = { items: [{ id: id(100), title: 'T', blocks: [level(1, [level(2, [level(3, [text(4)])])])] }] };
    const three = { items: [{ id: id(100), title: 'T', blocks: [level(1, [level(2, [text(3)])])] }] };
    expect(ok('tabs', three)).toMatchObject({ ok: true });
    const result = ok('tabs', four);
    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).toContain('limited to 3');
  });
});
