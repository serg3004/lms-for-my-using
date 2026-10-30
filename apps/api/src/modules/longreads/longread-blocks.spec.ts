import { isKnownBlockType, validateBlockContent } from './longread-blocks.js';
import { remapContentIds } from './longreads.service.js';

const ok = (type: string, content: unknown) => validateBlockContent(type, content);

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
