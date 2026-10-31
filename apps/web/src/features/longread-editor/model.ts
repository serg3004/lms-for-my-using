import { isImageContent, isAttachmentsContent } from '../longread-files/model.js';
import { audioContentSchema, videoContentSchema, embedContentSchema } from '@lms/shared/longread-media';
import type { LongreadDraft, SaveLongread } from '../../shared/api/longreads.js';
import { containerDepth, countNested, emptyTable, MAX_CONTAINER_DEPTH, MAX_ITEMS, MAX_NESTED_BLOCKS, MAX_SLOT_BLOCKS, slotsOf, tableValid, type NestedBlock, type TableContent } from './composite.js';

export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; code?: boolean; href?: string };
export type TextBlockType = 'paragraph' | 'heading' | 'list' | 'quote' | 'note' | 'divider' | 'code';
export type CompositeBlockType = 'table' | 'columns' | 'tabs' | 'accordion';
export type AddableBlockType = TextBlockType | CompositeBlockType | 'image' | 'attachments' | 'audio' | 'video' | 'embed';
export const textBlockTypes: TextBlockType[] = ['paragraph', 'heading', 'list', 'quote', 'note', 'divider', 'code'];
export const compositeTypes: string[] = ['table', 'columns', 'tabs', 'accordion'];
export const blockTypes: AddableBlockType[] = [...textBlockTypes, 'image', 'attachments', 'audio', 'video', 'embed', 'table', 'columns', 'tabs', 'accordion'];
export type EditorBlock = { key: string; type: string; schemaVersion: number; title: string | null; hidden: boolean; content: Record<string, unknown> };
export type EditorChapter = { cover?: LongreadDraft['settings']['cover']; key: string; title: string; hidden: boolean; blocks: EditorBlock[] };
export type EditorDocument = { chapters: EditorChapter[]; settings?: LongreadDraft['settings'] };
export const safeHref = (value: string) => /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|#[A-Za-z0-9_-]+)$/i.test(value) && value.length <= 2048;
export const editableBlock = (block: EditorBlock) => block.schemaVersion === 1 && blockTypes.includes(block.type as AddableBlockType);
export function fromDraft(draft: LongreadDraft): EditorDocument {
  return { settings: structuredClone(draft.settings), chapters: draft.chapters.map((chapter) => ({ key: chapter.id, title: chapter.title, hidden: chapter.hidden, ...(chapter.cover ? { cover: structuredClone(chapter.cover) } : {}),
    blocks: chapter.blocks.map((block) => ({ key: block.id, type: block.type, schemaVersion: block.schemaVersion, title: block.title ?? null, hidden: block.hidden ?? false, content: structuredClone(block.content) })) })) };
}
export function initialIds(draft: LongreadDraft): Map<string, string> {
  return new Map(draft.chapters.flatMap((chapter) => [[chapter.id, chapter.id], ...chapter.blocks.map((block) => [block.id, block.id])]) as [string, string][]);
}
export function savedIds(sent: EditorDocument, saved: LongreadDraft): Map<string, string> {
  const ids = new Map<string, string>();
  sent.chapters.forEach((chapter, index) => {
    const stored = saved.chapters[index];
    if (!stored) throw new Error('Invalid saved chapter');
    ids.set(chapter.key, stored.id);
    chapter.blocks.forEach((block, position) => {
      const savedBlock = stored.blocks[position];
      if (!savedBlock) throw new Error('Invalid saved block');
      ids.set(block.key, savedBlock.id);
    });
  });
  return ids;
}
export function toSave(document: EditorDocument, revision: number, settings: LongreadDraft['settings'], ids: Map<string, string>): SaveLongread {
  return { revision, settings: document.settings ?? settings, chapters: document.chapters.map((chapter) => ({
    ...(ids.has(chapter.key) ? { id: ids.get(chapter.key) } : {}), title: chapter.title, hidden: chapter.hidden, ...(chapter.cover !== undefined ? { cover: chapter.cover } : {}),
    blocks: chapter.blocks.map(({ key, ...block }) => ({ ...(ids.has(key) ? { id: ids.get(key) } : {}), ...block })),
  })) };
}
export function newBlock(type: AddableBlockType, itemTitle: (number: number) => string = String): EditorBlock {
  const content: Record<AddableBlockType, Record<string, unknown>> = {
    paragraph: { runs: [] }, heading: { level: 2, runs: [] }, quote: { runs: [], caption: '' },
    note: { runs: [], tone: 'info' }, divider: {}, code: { language: 'javascript', code: '' }, list: { ordered: false, items: [{ level: 1, runs: [] }] },
    image: { fileId: null, alt: '', caption: '', width: 100, align: 'center' }, attachments: { files: [] },
    audio: { fileId: null, caption: '' }, video: { source: 'file', fileId: null, poster: null, caption: '', width: 100 }, embed: { source: null, caption: '', width: 100 },
    table: emptyTable() as unknown as Record<string, unknown>,
    columns: { count: 2, columns: [{ id: crypto.randomUUID(), blocks: [] }, { id: crypto.randomUUID(), blocks: [] }] },
    tabs: { items: [1, 2].map((n) => ({ id: crypto.randomUUID(), title: itemTitle(n), blocks: [] })) },
    accordion: { items: [1, 2].map((n) => ({ id: crypto.randomUUID(), title: itemTitle(n), open: false, blocks: [] })) },
  };
  return { key: crypto.randomUUID(), type, schemaVersion: 1, title: null, hidden: false, content: content[type] };
}
export function copyContent(value: unknown, ids = new Map<string, string>()): unknown {
  if (Array.isArray(value)) return value.map((item) => copyContent(item, ids));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key === 'id' && typeof item === 'string' && /^[0-9a-f-]{36}$/i.test(item)) {
      if (!ids.has(item)) ids.set(item, crypto.randomUUID());
      return [key, ids.get(item)];
    }
    return [key, copyContent(item, ids)];
  }));
}
export function copyBlock(block: EditorBlock): EditorBlock {
  return { ...block, key: crypto.randomUUID(), content: copyContent(block.content) as Record<string, unknown> };
}
export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  if (index + delta < 0 || index + delta >= items.length) return items;
  const next = [...items]; const [item] = next.splice(index, 1); next.splice(index + delta, 0, item!); return next;
}
export function documentValid(document: EditorDocument): boolean {
  const count = document.settings?.requiredChapters;
  if (count !== undefined && (!Number.isInteger(count) || count < 0 || count > 200)) return false;
  if ([document.settings?.cover, ...document.chapters.map((chapter) => chapter.cover)].some((cover) => cover && !contentValid({ key: 'cover', type: 'image', schemaVersion: 1, title: null, hidden: false, content: cover as unknown as Record<string, unknown> }))) return false;
  return document.chapters.length > 0 && document.chapters.length <= 200 && document.chapters.every((chapter) =>
    chapter.title.trim().length > 0 && chapter.title.length <= 200 && chapter.blocks.length <= 1000 && chapter.blocks.every((block) =>
      (block.title?.length ?? 0) <= 200 && new TextEncoder().encode(JSON.stringify(block.content)).length <= 100_000 && contentValid(block)))
    && document.chapters.reduce((count, chapter) => count + chapter.blocks.length, 0) <= 5000;
}
function contentValid(block: EditorBlock): boolean {
  if (!editableBlock(block)) return true;
  if (compositeTypes.includes(block.type)) return compositeValid(block);
  const runsValid = (runs: unknown) => Array.isArray(runs) && runs.length <= 500 && runs.every((run: Run) => typeof run.text === 'string' && run.text.length <= 20_000 && (!run.href || safeHref(run.href)));
  if (block.type === 'image') return isImageContent(block.content);
  if (block.type === 'attachments') return isAttachmentsContent(block.content);
  if (block.type === 'audio') return audioContentSchema.safeParse(block.content).success;
  if (block.type === 'video') return videoContentSchema.safeParse(block.content).success;
  if (block.type === 'embed') return embedContentSchema.safeParse(block.content).success;
  if (block.type === 'code') return typeof block.content.code === 'string' && block.content.code.length <= 50_000;
  if (block.type === 'divider') return true;
  if (block.type !== 'list') return runsValid(block.content.runs);
  const items = block.content.items;
  if (!Array.isArray(items) || items.length > 500) return false;
  let previous = 0;
  return items.every((item: { level: number; runs: Run[] }) => {
    const valid = Number.isInteger(item.level) && item.level >= 1 && item.level <= 3 && item.level <= previous + 1 && runsValid(item.runs);
    previous = item.level; return valid;
  });
}

/** Mirrors the server rules for composite blocks so the editor does not keep trying to save what would be rejected. */
function compositeValid(block: EditorBlock): boolean {
  if (block.type === 'table') {
    const table = block.content as unknown as TableContent;
    return tableValid(table) && table.rows.every((row) => row.cells.every((cell) => cell.runs.every((run) => typeof run.text === 'string' && run.text.length <= 20_000)));
  }
  const content = block.content as { count?: number; columns?: { id: string; blocks: NestedBlock[] }[]; items?: { id: string; title: string; blocks: NestedBlock[] }[] };
  const slots = slotsOf(block as unknown as NestedBlock);
  if (block.type === 'columns' ? content.columns?.length !== content.count || ![2, 3].includes(content.count ?? 0) : !content.items?.length || content.items.length > MAX_ITEMS
    || content.items.some((item) => !item.title.trim() || item.title.length > 100)) return false;
  const ids = new Set<string>();
  const unique = (value: string) => !ids.has(value) && !!ids.add(value);
  const nestedValid = (nested: NestedBlock, depth: number): boolean => {
    if (!unique(nested.id)) return false;
    if (compositeTypes.includes(nested.type)) {
      if (depth + 1 > MAX_CONTAINER_DEPTH && nested.type !== 'table') return false;
      return compositeValid({ key: nested.id, type: nested.type, schemaVersion: 1, title: null, hidden: false, content: nested.content }) && (nested.type === 'table' || containerDepth(nested) + depth <= MAX_CONTAINER_DEPTH);
    }
    return contentValid({ key: nested.id, type: nested.type, schemaVersion: 1, title: null, hidden: false, content: nested.content });
  };
  return slots.every((slot) => slot.length <= MAX_SLOT_BLOCKS && slot.every((nested) => nestedValid(nested, 1))) && countNested(slots.flat()) <= MAX_NESTED_BLOCKS
    && [...(content.columns ?? []), ...(content.items ?? [])].every((entry) => unique(entry.id));
}
