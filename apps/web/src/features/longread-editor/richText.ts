import type { JSONContent } from '@tiptap/core';
import { blockAlign } from '@lms/shared/checklist-description';
import { safeHref, type EditorBlock, type Run } from './model.js';

export function inlineNodes(runs: Run[]): JSONContent[] {
  return runs.flatMap((run) => {
    const marks = [run.bold && { type: 'bold' }, run.italic && { type: 'italic' }, run.underline && { type: 'underline' }, run.code && { type: 'code' },
      (run.color || run.size || run.uppercase) && { type: 'descriptionStyle', attrs: { color: run.color ?? null, size: run.size ?? null, uppercase: run.uppercase ?? false } },
      run.href && safeHref(run.href) && { type: 'link', attrs: { href: run.href } }].filter(Boolean) as NonNullable<JSONContent['marks']>;
    return run.text.split('\n').flatMap((text, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...(text ? [{ type: 'text', text, marks }] : [])]);
  });
}
export function textRuns(node: JSONContent): Run[] {
  const runs: Run[] = [];
  function walk(part: JSONContent) {
    if (part.type === 'hardBreak') { runs.push({ text: '\n' }); return; }
    if (part.type === 'text' && part.text) {
      const run: Run = { text: part.text };
      for (const mark of part.marks ?? []) {
        if (mark.type === 'bold' || mark.type === 'italic' || mark.type === 'underline' || mark.type === 'code') run[mark.type] = true;
        if (mark.type === 'descriptionStyle') {
          if (typeof mark.attrs?.color === 'string') run.color = mark.attrs.color;
          if (typeof mark.attrs?.size === 'number') run.size = mark.attrs.size;
          if (mark.attrs?.uppercase === true) run.uppercase = true;
        }
        if (mark.type === 'link' && typeof mark.attrs?.href === 'string' && safeHref(mark.attrs.href)) run.href = mark.attrs.href;
      }
      runs.push(run); return;
    }
    part.content?.forEach((child, index) => {
      if (index && child.type === 'paragraph') runs.push({ text: '\n' });
      walk(child);
    });
  }
  walk(node); return runs;
}
const paragraph = (block: EditorBlock, runs: Run[]): JSONContent => ({ type: 'paragraph', attrs: { textAlign: blockAlign(block.content.align) ?? 'left' }, content: inlineNodes(runs) });
/** The alignment of the first paragraph of the editor document; undefined when the editor has no alignment attribute. */
function documentAlign(node: JSONContent): string | undefined {
  if (node.type === 'paragraph') return typeof node.attrs?.textAlign === 'string' ? node.attrs.textAlign : undefined;
  for (const child of node.content ?? []) { const found = documentAlign(child); if (found !== undefined) return found; }
  return undefined;
}
/** Left is the default and is never stored; an editor without the attribute (table cells) leaves the stored value alone. */
function withAlign(content: Record<string, unknown>, doc: JSONContent): Record<string, unknown> {
  const align = documentAlign(doc);
  if (align === undefined) return content;
  const chosen = blockAlign(align), next = { ...content };
  // An existing key keeps its place, so the editor's comparison with the stored content stays stable.
  if (chosen) next.align = chosen; else delete next.align;
  return next;
}
export function toRichDocument(block: EditorBlock): JSONContent {
  if (block.type !== 'list') return { type: 'doc', content: [paragraph(block, block.content.runs as Run[])] };
  const items = block.content.items as { level: number; runs: Run[] }[];
  const kind = block.content.ordered ? 'orderedList' : 'bulletList';
  const root: JSONContent = { type: kind, content: [] };
  const lists: JSONContent[] = [root];
  for (const item of items) {
    while (lists.length > item.level) lists.pop();
    while (lists.length < item.level) {
      const child: JSONContent = { type: kind, content: [] };
      lists.at(-1)!.content!.at(-1)!.content!.push(child); lists.push(child);
    }
    lists.at(-1)!.content!.push({ type: 'listItem', content: [paragraph(block, item.runs)] });
  }
  if (!root.content?.length) root.content = [{ type: 'listItem', content: [{ type: 'paragraph', attrs: { textAlign: blockAlign(block.content.align) ?? 'left' } }] }];
  return { type: 'doc', content: [root] };
}
export function fromRichDocument(doc: JSONContent, block: EditorBlock): Record<string, unknown> {
  if (block.type !== 'list') return withAlign({ ...block.content, runs: textRuns(doc) }, doc);
  const items: { level: number; runs: Run[] }[] = [];
  function walk(node: JSONContent, level: number) {
    if (node.type === 'listItem') {
      items.push({ level: Math.max(1, level), runs: textRuns({ type: 'doc', content: node.content?.filter((child) => child.type !== 'bulletList' && child.type !== 'orderedList') }) });
      node.content?.filter((child) => child.type === 'bulletList' || child.type === 'orderedList').forEach((child) => walk(child, level));
    } else if (node.type === 'paragraph' && level === 0) items.push({ level: 1, runs: textRuns(node) });
    else node.content?.forEach((child) => walk(child, node.type === 'bulletList' || node.type === 'orderedList' ? level + 1 : level));
  }
  walk(doc, 0);
  return withAlign({ ...block.content, items: items.length ? items : [{ level: 1, runs: [] }] }, doc);
}
export function listDepth(doc: JSONContent, depth = 0): number {
  const next = depth + (doc.type === 'bulletList' || doc.type === 'orderedList' ? 1 : 0);
  return Math.max(next, ...(doc.content ?? []).map((child) => listDepth(child, next)));
}
/** Browser HTML is never inserted: even rich clipboard content becomes inert plain text. */
export function clipboardText(plain: string, html: string): string {
  if (plain || !html) return plain;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,svg,math').forEach((element) => element.remove());
  doc.querySelectorAll('br').forEach((element) => element.replaceWith('\n'));
  doc.querySelectorAll('p,div,li,h1,h2,h3,blockquote').forEach((element) => element.append('\n'));
  return doc.body.textContent?.trimEnd() ?? '';
}
