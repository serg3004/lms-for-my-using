// @vitest-environment jsdom
import '../../i18n/index.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttachmentEditor, ImageFields } from './FileEditors.js';
import { describe, expect, it } from 'vitest';
import { prepareFiles } from './model.js';
import { fromDraft, toSave, copyBlock, documentValid, editableBlock } from '../longread-editor/model.js';
import { safeBlock } from '../longread-reader/model.js';
import type { LongreadDraft } from '../../shared/api/longreads.js';
const id = '38600000-0000-4000-8000-000000000001';
const image = { fileId: id, alt: 'Equipment', caption: 'Caption', width: 75, align: 'center' as const };
const draft: LongreadDraft = { lessonId: id, revision: 1, schemaVersion: 1, settings: { readingOrder: 'free', requiredChapters: 0, direction: 'ltr', tableOfContents: 'off', allowCopy: true, cover: image }, chapters: [{ id, title: 'Chapter', hidden: false, anchor: 'chapter', cover: image, blocks: [{ id, type: 'image', known: true, schemaVersion: 1, content: image }] }] };
describe('longread image/file state', () => {
  it('retains file references on copy, includes covers on save and explicitly serializes their removal', () => {
    const document = fromDraft(draft), copy = copyBlock(document.chapters[0]!.blocks[0]!);
    expect(copy.key).not.toBe(id); expect(copy.content.fileId).toBe(id);
    expect(toSave(document, 1, draft.settings, new Map()).chapters[0]!.cover).toEqual(image);
    document.chapters[0]!.cover = null; document.settings!.cover = null;
    const saved = toSave(document, 1, draft.settings, new Map()); expect(saved.chapters[0]!.cover).toBeNull(); expect(saved.settings.cover).toBeNull();
  });
  it('checks image geometry both for blocks and covers before autosave', () => {
    const document = fromDraft(draft); expect(documentValid(document)).toBe(true);
    document.settings!.cover = { ...image, width: 0 }; expect(documentValid(document)).toBe(false);
    expect(safeBlock({ type: 'image', schemaVersion: 1, content: { ...image, width: 999 } })).toBeNull();
    expect(safeBlock({ type: 'image', schemaVersion: 1, content: image })?.type).toBe('image');
    expect(safeBlock({ type: 'attachments', schemaVersion: 1, content: { files: [{ fileId: 'javascript:bad' }] } })).toBeNull();
    expect(editableBlock({ key: id, type: 'image', schemaVersion: 1, title: null, hidden: false, content: { ...image, width: 0 } })).toBe(true);
  });
  it('accepts 20 attachments, rejects 21/empty/wrong types and normalizes missing browser MIME metadata', () => {
    const files = Array.from({ length: 20 }, () => new File(['%PDF'], 'file.pdf'));
    expect(prepareFiles(files, false)).toHaveLength(20); expect(prepareFiles(files, false)[0]!.type).toBe('application/pdf');
    expect(() => prepareFiles([...files, files[0]!], false)).toThrow('batch');
    expect(() => prepareFiles([new File([], 'empty.pdf')], false)).toThrow('size');
    expect(() => prepareFiles([new File(['<svg>'], 'bad.svg')], true)).toThrow('type');
    expect(() => prepareFiles([files[0]!], true)).toThrow('type');
  });
  it('keeps temporarily invalid geometry editable and renders malformed legacy media safely', () => {
    expect(renderToStaticMarkup(<ImageFields lessonId={id} image={{ ...image, width: 0 }} onChange={() => {}} />)).toContain('type="number"');
    expect(renderToStaticMarkup(<AttachmentEditor lessonId={id} files={'future opaque format' as never} onChange={() => {}} />)).not.toContain('type="file"');
    expect(renderToStaticMarkup(<ImageFields lessonId={id} image={{ ...image, caption: {} as never }} onChange={() => {}} />)).not.toContain('type="file"');
  });
  it('enforces the 50 MB boundary without a document-wide limit', () => {
    const file = new File(['x'], 'file.pdf'); Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 });
    expect(() => prepareFiles([file], false)).toThrow('size');
  });
});
