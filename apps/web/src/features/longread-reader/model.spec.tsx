// @vitest-environment jsdom
import '../../i18n/index.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LongreadReaderDocument, ReaderBlock } from '../../shared/api/longreads.js';
import { LongreadReader } from './LongreadReader.js';
import { chapterContents, chapterHash, readHash, safeBlock } from './model.js';

const heading = (level: number, text: string, excludeFromToc = false): ReaderBlock => ({ type: 'heading', schemaVersion: 1, content: { level, runs: [{ text }], excludeFromToc } });
const document: LongreadReaderDocument = { lessonId: 'lesson', version: 1, schemaVersion: 1, preview: false,
  settings: { readingOrder: 'free', requiredChapters: 1, tableOfContents: 'expanded', direction: 'rtl', allowCopy: false },
  chapters: [{ title: 'الفصل 1', anchor: 'stable', blocks: [heading(2, 'Visible H2'), heading(3, 'Nested H3'), heading(2, 'Hidden TOC H2', true), heading(3, 'Orphan H3'),
    { type: 'paragraph', schemaVersion: 1, content: { runs: [{ text: 'Русский Қазақша 中文 العربية 123', bold: true }, { text: 'https://example.test/123', href: 'https://example.test/123' }] } },
    { type: 'code', schemaVersion: 1, content: { language: 'html', code: '<script>window.attack = true</script>' } },
  ] }], navigation: { chapter: 'stable', headingIndex: null, allowedAnchors: ['stable'], previousAnchor: null, nextAnchor: null },
};
describe('safe longread reader and contents', () => {
  it('keeps H2/H3 hierarchy while omitting only the requested contents entry', () => {
    expect(chapterContents(document.chapters[0]!)).toMatchObject([{ label: 'Visible H2', children: [{ label: 'Nested H3' }] }, { label: 'Orphan H3', children: [] }]);
    const html = renderToStaticMarkup(<LongreadReader data={document} onNavigate={() => {}} />);
    const root = globalThis.document.createElement('div'); root.innerHTML = html;
    expect(root.querySelector('nav[aria-label="Оглавление"] ul ul a')?.textContent).toBe('Nested H3');
    expect(root.querySelector('nav[aria-label="Оглавление"]')?.textContent).not.toContain('Hidden TOC H2');
    expect(root.querySelector('article')?.textContent).toContain('Hidden TOC H2');
  });
  it('removes the contents column entirely in off mode and preserves RTL/keyboard access', () => {
    const html = renderToStaticMarkup(<LongreadReader data={{ ...document, settings: { ...document.settings, tableOfContents: 'off' } }} onNavigate={() => {}} />);
    const root = globalThis.document.createElement('div'); root.innerHTML = html;
    expect(root.querySelector('aside')).toBeNull(); expect(root.querySelector('[dir="rtl"]')).not.toBeNull();
    expect(root.querySelector('bdi[dir="ltr"]')?.textContent).toBe('1 / 1');
    expect(root.querySelector('pre[tabindex="0"]')?.textContent).toContain('<script>');
    expect(root.querySelector('script')).toBeNull(); expect(root.textContent).not.toContain('Копировать код');
    expect(root.querySelector('a[href="https://example.test/123"] bdi')).not.toBeNull();
  });
  it.each(['javascript:alert(1)', 'data:text/html,hi', 'vbscript:bad'])('refuses a dangerous run URL: %s', (href) => {
    expect(safeBlock({ type: 'paragraph', schemaVersion: 1, content: { runs: [{ text: 'label', href }] } })).toBeNull();
  });
  it('treats unknown/future versions and malformed content as unsupported data', () => {
    expect(safeBlock({ type: 'future_widget', schemaVersion: 9, content: { html: '<iframe>' } })).toBeNull();
    expect(safeBlock({ ...heading(2, 'Future'), schemaVersion: 2 })).toBeNull();
    expect(safeBlock({ type: 'quote', schemaVersion: 1, content: { runs: [], caption: { unsafe: true } } })).toBeNull();
    expect(safeBlock({ type: 'list', schemaVersion: 1, content: { ordered: false, items: [{ level: 3, runs: [] }] } })).toBeNull();
  });
  it('uses stable chapter anchors and bounded heading indices in URLs', () => {
    expect(readHash(chapterHash('ch-stable', 2))).toEqual({ chapter: 'ch-stable', headingIndex: 2 });
    expect(readHash('#chapter=ch-stable&heading=NaN')).toEqual({ chapter: 'ch-stable' });
  });
});
