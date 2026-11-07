import { parseDocument } from 'htmlparser2';

export const DESCRIPTION_SIZES = [14, 16, 20, 26] as const;
/** Each preset passes WCAG AA against white at the smallest size. */
export const DESCRIPTION_COLORS = ['#172033', '#B91C1C', '#166534', '#1D4ED8', '#6B21A8'] as const;
export const DESCRIPTION_MARKUP_LIMIT = 24000;
export const DESCRIPTION_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export type DescriptionAlign = (typeof DESCRIPTION_ALIGNS)[number];
export type DescriptionStyle = { bold?: boolean; italic?: boolean; underline?: boolean; uppercase?: boolean; size?: number; color?: string };
export type DescriptionRun = DescriptionStyle & { text: string };
type HtmlNode = ReturnType<typeof parseDocument>['children'][number];
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'head']);
const blocks = new Set(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'tr', 'blockquote']);
export const isRichDescription = (value: string) => /<\/?(?:p|strong|em|u|span|br)\b[^<>]*>/i.test(value);

export function descriptionStyle(style: string): DescriptionStyle {
  const result: DescriptionStyle = {};
  for (const declaration of style.split(';')) {
    const [rawName, rawValue] = declaration.split(':');
    const name = rawName?.trim().toLowerCase(), value = rawValue?.trim().toLowerCase();
    if (name === 'color' && /^#[\da-f]{6}$/.test(value ?? '')) result.color = value!.toUpperCase();
    if (name === 'font-size' && /^(14|16|20|26)px$/.test(value ?? '')) result.size = Number.parseInt(value!, 10);
    if (name === 'text-transform' && value === 'uppercase') result.uppercase = true;
    if (name === 'font-weight' && (value === 'bold' || value === '700')) result.bold = true;
    if (name === 'font-style' && value === 'italic') result.italic = true;
    if (name === 'text-decoration' && value === 'underline') result.underline = true;
  }
  return result;
}

/** One alignment per field: the first paragraph decides. Left is the default and is never written, old texts stay as they are. */
export function descriptionAlign(value: string): DescriptionAlign {
  if (!/<p\b/i.test(value)) return 'left';
  let found: DescriptionAlign = 'left';
  function visit(nodes: HtmlNode[], depth: number): boolean {
    if (depth > 32) return true;
    for (const node of nodes) {
      if (!('name' in node) || !('attribs' in node) || !('children' in node) || blocked.has(node.name)) continue;
      if (node.name === 'p') {
        const match = /(?:^|;)\s*text-align\s*:\s*(center|right|justify)\s*(?:;|$)/i.exec(node.attribs.style ?? '');
        if (match) found = match[1]!.toLowerCase() as DescriptionAlign;
        return true;
      }
      if (visit(node.children, depth + 1)) return true;
    }
    return false;
  }
  visit(parseDocument(value, { decodeEntities: true }).children, 0);
  return found;
}
const wrapAlign = (html: string, align: DescriptionAlign) => align === 'left' ? `<p>${html}</p>` : `<p style="text-align:${align}">${html}</p>`;

function readHtml(value: string): DescriptionRun[] {
  const runs: DescriptionRun[] = [];
  function append(text: string, style: DescriptionStyle = {}) {
    if (!text) return;
    const previous = runs.at(-1);
    if (previous && previous.bold === style.bold && previous.italic === style.italic && previous.underline === style.underline && previous.uppercase === style.uppercase && previous.size === style.size && previous.color === style.color) previous.text += text;
    else runs.push({ ...style, text });
  }
  function newline() { if (runs.length && !runs.at(-1)!.text.endsWith('\n')) append('\n'); }
  function visit(nodes: HtmlNode[], inherited: DescriptionStyle, depth: number) {
    if (depth > 32) return;
    for (const node of nodes) {
      if (node.type === 'text') { append(node.data, inherited); continue; }
      if (!('name' in node) || !('attribs' in node) || !('children' in node) || blocked.has(node.name)) continue;
      if (node.name === 'br') { append('\n', inherited); continue; }
      if (blocks.has(node.name)) newline();
      const style = { ...inherited, ...descriptionStyle(node.attribs.style ?? '') };
      if (node.name === 'strong' || node.name === 'b') style.bold = true;
      if (node.name === 'em' || node.name === 'i') style.italic = true;
      if (node.name === 'u') style.underline = true;
      visit(node.children, style, depth + 1);
      if (node.name === 'p') append('\n'); else if (blocks.has(node.name)) newline();
    }
  }
  visit(parseDocument(value, { decodeEntities: true }).children, {}, 0);
  while (runs.at(-1)?.text === '\n') runs.pop();
  if (runs.length) runs[runs.length - 1]!.text = runs.at(-1)!.text.replace(/\n$/, '');
  return runs;
}

/** No URLs, arbitrary attributes, CSS functions or foreign namespaces survive this serializer. */
export function sanitizeDescription(value: string): string {
  if (!/<\/?[a-z][^<>]*>/i.test(value)) return value;
  const runs = readHtml(value);
  const plain = runs.map((run) => run.text).join(''), align = descriptionAlign(value);
  if (align === 'left' && !runs.some(({ bold, italic, underline, uppercase, size, color }) => bold || italic || underline || uppercase || size || color) && !/[<>]/.test(plain)) return plain;
  const html = runs.map((run) => {
    let content = escape(run.text).replaceAll('\n', '<br>');
    if (run.bold) content = `<strong>${content}</strong>`;
    if (run.italic) content = `<em>${content}</em>`;
    if (run.underline) content = `<u>${content}</u>`;
    const style = [run.size ? `font-size:${run.size}px` : '', run.color ? `color:${run.color}` : '', run.uppercase ? 'text-transform:uppercase' : ''].filter(Boolean).join(';');
    return style ? `<span style="${style}">${content}</span>` : content;
  }).join('');
  return html ? wrapAlign(html, align) : '';
}

export function descriptionRuns(value: string): DescriptionRun[] {
  return isRichDescription(value) ? readHtml(value) : [{ text: value }];
}
export const descriptionText = (value: string) => descriptionRuns(value).map((run) => run.uppercase ? run.text.toUpperCase() : run.text).join('');
export function descriptionHtml(value: string, options: { align?: boolean } = {}) {
  return isRichDescription(value) ? wrapAlign(`${descriptionRuns(value).map((run) => {
    let text = escape(run.text).replaceAll('\n', '<br>');
    if (run.bold) text = `<strong>${text}</strong>`;
    if (run.italic) text = `<em>${text}</em>`;
    if (run.underline) text = `<u>${text}</u>`;
    const style = [run.size ? `font-size:${run.size}px` : '', run.color ? `color:${run.color}` : '', run.uppercase ? 'text-transform:uppercase' : ''].filter(Boolean).join(';');
    return style ? `<span style="${style}">${text}</span>` : text;
  }).join('')}`, options.align === false ? 'left' : descriptionAlign(value)) : `<p>${escape(value).replaceAll('\n', '<br>')}</p>`;
}
export function descriptionContrast(color: string) {
  if (!/^#[\da-f]{6}$/i.test(color)) return 0;
  const channels = [1, 3, 5].map((index) => {
    const value = Number.parseInt(color.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]! + 0.05);
}
