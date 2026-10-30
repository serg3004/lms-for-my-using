import { isKnownBlockType, validateBlockContent } from './longread-blocks.js';

export type SnapshotBlock = { type: string; schemaVersion: number; content: unknown };
export type SnapshotChapter = { title: string; anchor: string; hidden: boolean; blocks: SnapshotBlock[] };
export type PublishRefusalCode = 'empty_document' | 'unknown_block' | 'invalid_block' | 'broken_link' | 'required_chapters_exceed_visible';
export type PublishRefusal = { code: PublishRefusalCode; message: string; chapter?: string; blockIndex?: number };

/** All `href` values of a block, wherever they sit in its content (runs, table cells, nested blocks). */
function collectHrefs(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => collectHrefs(item, found));
  else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'href' && typeof item === 'string') found.push(item);
      else collectHrefs(item, found);
    }
  }
  return found;
}

/**
 * Reasons why a draft cannot be published; an empty list means it can. Media and question blocks (PR 386-389) add their
 * own checks through the same list, so the publish endpoint and the pre-check always agree.
 */
export function checkPublishable(chapters: SnapshotChapter[], settings: { requiredChapters?: number }): PublishRefusal[] {
  const refusals: PublishRefusal[] = [];
  const visible = chapters.filter((chapter) => !chapter.hidden);
  if (!visible.some((chapter) => chapter.blocks.length > 0)) {
    refusals.push({ code: 'empty_document', message: 'A longread needs at least one visible chapter with content' });
  }
  if ((settings.requiredChapters ?? 0) > visible.length) {
    refusals.push({ code: 'required_chapters_exceed_visible', message: 'Required chapters exceed the number of visible chapters' });
  }

  const anchors = new Set(chapters.map((chapter) => chapter.anchor));
  for (const chapter of chapters) {
    chapter.blocks.forEach((block, blockIndex) => {
      const where = { chapter: chapter.title, blockIndex };
      if (!isKnownBlockType(block.type)) {
        refusals.push({ code: 'unknown_block', message: `Block type "${block.type}" is not supported by this server`, ...where });
        return;
      }
      const result = validateBlockContent(block.type, block.content);
      if (!result.ok) {
        refusals.push({ code: 'invalid_block', message: result.message, ...where });
        return;
      }
      for (const href of collectHrefs(block.content)) {
        if (href.startsWith('#') && !anchors.has(href.slice(1))) {
          refusals.push({ code: 'broken_link', message: `Link ${href} points to a missing chapter`, ...where });
        }
      }
    });
  }
  return refusals;
}
