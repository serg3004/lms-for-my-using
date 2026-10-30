// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clipboardText, fromRichDocument, listDepth, toRichDocument } from './richText.js';
import { copyBlock, initialIds, fromDraft, newBlock, savedIds, toSave, safeHref } from './model.js';
import type { LongreadDraft } from '../../shared/api/longreads.js';

const settings: LongreadDraft['settings'] = { readingOrder: 'free', requiredChapters: 0, tableOfContents: 'expanded', direction: 'ltr', allowCopy: true };
describe('longread structured text boundary', () => {
  it('round trips formatted multilingual text and three nested list levels without HTML', () => {
    const block = newBlock('list');
    block.content = { ordered: true, items: [
      { level: 1, runs: [{ text: 'Русский', bold: true }] },
      { level: 2, runs: [{ text: 'Қазақша', italic: true, underline: true }] },
      { level: 3, runs: [{ text: '中文', href: 'https://example.test' }, { text: '\n' }, { text: '<script>code</script>', code: true }] },
      { level: 1, runs: [{ text: 'English' }] },
    ] };
    const json = toRichDocument(block);
    expect(listDepth(json)).toBe(3);
    expect(fromRichDocument(json, block)).toEqual(block.content);
  });
  it('converts hostile rich paste to text, removing active elements and all attributes', () => {
    const clean = clipboardText('', '<p onclick="evil()">Safe <a href="javascript:evil()">link</a><img src="bad" onerror="evil()"></p><script>evil()</script><iframe srcdoc="evil()"></iframe>');
    expect(clean).toBe('Safe link');
    const block = newBlock('paragraph'); block.content = { runs: [{ text: clean }] };
    expect(fromRichDocument(toRichDocument(block), block)).toEqual({ runs: [{ text: 'Safe link' }] });
    expect((window as unknown as { evil?: unknown }).evil).toBeUndefined();
  });
  it.each(['javascript:alert(1)', 'data:text/html,hello', '\nhttps://example.test', '//example.test', 'vbscript:bad'])('rejects unsafe link %s', (href) => expect(safeHref(href)).toBe(false));
  it('keeps a literal plain-text paste inert and drops unsafe marks during serialization', () => {
    expect(clipboardText('<script>alert(1)</script>', '')).toBe('<script>alert(1)</script>');
    expect(fromRichDocument({ type: 'doc', content: [{ type: 'text', text: 'safe', marks: [{ type: 'link', attrs: { href: 'javascript:bad()' } }] }] }, newBlock('paragraph'))).toEqual({ runs: [{ text: 'safe' }] });
  });
  it('maps server ids to the sent snapshot, preserving later local edits and opaque blocks', () => {
    const draft: LongreadDraft = { lessonId: 'lesson', revision: 1, schemaVersion: 1, settings, chapters: [{ id: 'chapter', title: 'First', anchor: 'stable', hidden: false, blocks: [] }] };
    const sent = fromDraft(draft); const block = newBlock('paragraph'); sent.chapters[0]!.blocks.push(block);
    const saved: LongreadDraft = { ...draft, revision: 2, chapters: [{ ...draft.chapters[0]!, blocks: [{ id: 'new-server-id', ...block, known: true }] }] };
    const ids = savedIds(sent, saved);
    const newer = structuredClone(sent); newer.chapters[0]!.blocks[0]!.content = { runs: [{ text: 'Typed while saving' }] };
    expect(toSave(newer, 2, settings, ids).chapters[0]!.blocks[0]).toMatchObject({ id: 'new-server-id', content: { runs: [{ text: 'Typed while saving' }] } });
    const unknown = { ...block, type: 'future_widget', schemaVersion: 8, content: { opaque: '<iframe>', nested: { a: 1 } } };
    const copy = copyBlock(unknown); expect(copy.key).not.toBe(unknown.key); expect(copy.content).toEqual(unknown.content);
    expect(initialIds(draft).get('chapter')).toBe('chapter');
  });
});
