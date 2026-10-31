import { isImageContent as safeImage, isAttachmentsContent } from '../longread-files/model.js';
import { audioContentSchema, videoContentSchema, embedContentSchema, type LongreadAudio, type LongreadVideo, type LongreadEmbed } from '@lms/shared/longread-media';
import type { LongreadImage, ReaderBlock, ReaderChapter } from '../../shared/api/longreads.js';
import { safeHref, type Run } from '../longread-editor/model.js';

export type TextContent = { runs: Run[]; level?: 1 | 2 | 3; excludeFromToc?: boolean; caption?: string; tone?: string };
export type ListContent = { ordered: boolean; items: { level: number; runs: Run[] }[] };
export type CodeContent = { code: string; language: string };
export { safeImage };
export type SafeBlock = { type: 'audio'; content: LongreadAudio } | { type: 'video'; content: LongreadVideo } | { type: 'embed'; content: LongreadEmbed } | { type: 'image'; content: LongreadImage } | { type: 'attachments'; content: { files: { fileId: string; label?: string }[] } } | { type: 'paragraph' | 'heading' | 'quote' | 'note'; content: TextContent } | { type: 'list'; content: ListContent } | { type: 'code'; content: CodeContent } | { type: 'divider'; content: Record<string, never> };
function runsValid(raw: unknown): raw is Run[] {
  return Array.isArray(raw) && raw.length <= 500 && raw.every((run) => run && typeof run === 'object' && typeof run.text === 'string' && run.text.length <= 20_000
    && ['bold', 'italic', 'underline', 'code'].every((mark) => run[mark] === undefined || typeof run[mark] === 'boolean')
    && (run.href === undefined || (typeof run.href === 'string' && safeHref(run.href))));
}
/** Rendering never interprets HTML, uses editor HTML or loads an editor engine. */
export function safeBlock(block: ReaderBlock): SafeBlock | null {
  if (block.hidden || block.schemaVersion !== 1 || !block.content || typeof block.content !== 'object' || Array.isArray(block.content)) return null;
  const content = block.content as Record<string, unknown>;
  if (block.type === 'audio') { const parsed = audioContentSchema.safeParse(content); return parsed.success ? { type: 'audio', content: parsed.data } : null; }
  if (block.type === 'video') { const parsed = videoContentSchema.safeParse(content); return parsed.success ? { type: 'video', content: parsed.data } : null; }
  if (block.type === 'embed') { const parsed = embedContentSchema.safeParse(content); return parsed.success ? { type: 'embed', content: parsed.data } : null; }
  if (block.type === 'image') return safeImage(content) ? { type: 'image', content } : null;
  if (block.type === 'attachments') return isAttachmentsContent(content) ? { type: 'attachments', content } : null;
  if (block.type === 'divider') return { type: 'divider', content: {} };
  if (block.type === 'code') return typeof content.code === 'string' && content.code.length <= 50_000 && typeof content.language === 'string' ? { type: 'code', content: content as CodeContent } : null;
  if (block.type === 'list') {
    if (!Array.isArray(content.items) || content.items.length > 500) return null;
    let previous = 0;
    if (!content.items.every((item) => {
      const level: unknown = item?.level;
      if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 3 || level > previous + 1 || !runsValid(item.runs)) return false;
      previous = level; return true;
    })) return null;
    return { type: 'list', content: content as ListContent };
  }
  if (!['paragraph', 'heading', 'quote', 'note'].includes(block.type) || !runsValid(content.runs)) return null;
  if (block.type === 'heading' && ![1, 2, 3].includes(content.level as number)) return null;
  if (content.caption !== undefined && typeof content.caption !== 'string') return null;
  if (content.tone !== undefined && !['info', 'success', 'warning', 'danger'].includes(content.tone as string)) return null;
  return { type: block.type as 'paragraph' | 'heading' | 'quote' | 'note', content: content as TextContent };
}
export const headingId = (chapter: string, index: number) => `longread-${chapter}-heading-${index}`;
export const chapterHash = (chapter: string, headingIndex?: number | null) => `#${new URLSearchParams({ chapter, ...(headingIndex != null ? { heading: String(headingIndex) } : {}) })}`;
export function readHash(hash: string): { chapter?: string; headingIndex?: number } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const chapter = params.get('chapter') ?? undefined;
  const heading = params.get('heading');
  return { chapter, ...(heading !== null && /^\d{1,3}$/.test(heading) ? { headingIndex: Number(heading) } : {}) };
}
export type TocEntry = { index: number; label: string; level: 2 | 3; children: TocEntry[] };
export function chapterContents(chapter: ReaderChapter): TocEntry[] {
  const entries: TocEntry[] = []; let parent: TocEntry | null = null;
  chapter.blocks.forEach((block, index) => {
    const value = safeBlock(block);
    if (!value || value.type !== 'heading' || ![2, 3].includes(value.content.level!)) return;
    if (value.content.level === 2) parent = null;
    if (value.content.excludeFromToc) return;
    const entry: TocEntry = { index, label: value.content.runs.map((run) => run.text).join(''), level: value.content.level as 2 | 3, children: [] };
    if (entry.level === 3 && parent) parent.children.push(entry); else entries.push(entry);
    if (entry.level === 2) parent = entry;
  });
  return entries;
}
