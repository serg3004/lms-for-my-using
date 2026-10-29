import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type PDFDocument from 'pdfkit';

/**
 * PR 372: fonts of the session report PDF. Noto Sans covers Latin and Cyrillic (including the Kazakh
 * letters); Noto Sans SC covers the Chinese the interface and the user's own comments can contain. Both
 * packages ship their fonts already split into unicode-range subsets, so a text run is mapped to the
 * subset that holds its code points and only those files are loaded into the document. A code point that
 * no subset covers is printed as "?" instead of an empty box. Both fonts are licensed under the SIL
 * Open Font License 1.1 (see docs/runbooks/PDF_FONTS.md).
 */

export type PdfFontWeight = 400 | 700;
type Face = { file: string; ranges: Array<[number, number]> };

const require = createRequire(import.meta.url);
const PACKAGES = ['@fontsource/noto-sans', '@fontsource/noto-sans-sc'] as const;
const REPLACEMENT = '?';

function parseRange(token: string): [number, number] | null {
  const body = /^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i.exec(token.trim());
  if (!body) return null;
  const start = body[1]!;
  if (start.includes('?')) return [parseInt(start.replaceAll('?', '0'), 16), parseInt(start.replaceAll('?', 'f'), 16)];
  return [parseInt(start, 16), parseInt(body[2] ?? start, 16)];
}

function parseFaces(cssPath: string): Face[] {
  const dir = path.dirname(cssPath);
  const faces: Face[] = [];
  for (const block of readFileSync(cssPath, 'utf8').split('@font-face').slice(1)) {
    const file = /url\(\.\/files\/([^)]+?\.woff)\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    if (!file || !range) continue;
    const ranges = range.split(',').map(parseRange).filter((item): item is [number, number] => item !== null);
    faces.push({ file: path.join(dir, 'files', file), ranges });
  }
  return faces;
}

const facesByWeight = new Map<PdfFontWeight, Face[]>();

function facesFor(weight: PdfFontWeight): Face[] {
  let faces = facesByWeight.get(weight);
  if (!faces) {
    faces = PACKAGES.flatMap((name) => parseFaces(require.resolve(`${name}/${weight}.css`)));
    facesByWeight.set(weight, faces);
  }
  return faces;
}

export function findFontFile(codePoint: number, weight: PdfFontWeight): string | null {
  // Like a browser, the last @font-face that covers a code point wins (fontsource subsets overlap, e.g. U+04B0).
  for (const face of [...facesFor(weight)].reverse()) {
    if (face.ranges.some(([from, to]) => codePoint >= from && codePoint <= to)) return face.file;
  }
  return null;
}

export type FontRun = { file: string; text: string };

/** Splits a string into runs that each live in one font file; unsupported code points become "?". */
export function splitIntoFontRuns(text: string, weight: PdfFontWeight): FontRun[] {
  const runs: FontRun[] = [];
  for (const char of text.replace(/[\r\n\t]+/g, ' ')) {
    let file = findFontFile(char.codePointAt(0)!, weight);
    let printed = char;
    if (!file) {
      printed = REPLACEMENT;
      file = findFontFile(REPLACEMENT.codePointAt(0)!, weight)!;
    }
    const last = runs.at(-1);
    if (last?.file === file) last.text += printed;
    else runs.push({ file, text: printed });
  }
  return runs;
}

type Segment = { file: string; text: string; width: number };
type Line = { segments: Segment[]; width: number };

const isCjk = (char: string) => /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(char);

/**
 * Registers the needed font files on one document (once each) and draws text that may mix several
 * font files. pdfkit's own wrapping cannot follow a font change inside a paragraph, so the lines are
 * broken here: by words, and between any two Chinese characters.
 */
export class PdfFontBook {
  private readonly names = new Map<string, string>();
  private readonly widths = new Map<string, number>();

  constructor(private readonly document: InstanceType<typeof PDFDocument>) {}

  private nameOf(file: string) {
    let name = this.names.get(file);
    if (!name) {
      name = `f${this.names.size}`;
      this.document.registerFont(name, file);
      this.names.set(file, name);
    }
    return name;
  }

  private widthOf(file: string, text: string, size: number) {
    const key = `${file}|${size}|${text}`;
    let width = this.widths.get(key);
    if (width === undefined) {
      width = this.document.font(this.nameOf(file)).fontSize(size).widthOfString(text);
      this.widths.set(key, width);
    }
    return width;
  }

  private segmentsOf(text: string, weight: PdfFontWeight, size: number): Segment[] {
    return splitIntoFontRuns(text, weight).map((run) => ({ ...run, width: this.widthOf(run.file, run.text, size) }));
  }

  /** Greedy line breaking of one paragraph (no newlines in `paragraph`). */
  private breakLines(paragraph: string, weight: PdfFontWeight, size: number, maxWidth: number): Line[] {
    const words: string[] = [];
    let current = '';
    const flush = () => { if (current) words.push(current); current = ''; };
    for (const char of paragraph) {
      if (char === ' ') { flush(); words.push(' '); } else if (isCjk(char)) { flush(); words.push(char); } else current += char;
    }
    flush();

    const lines: Line[] = [];
    let line: Line = { segments: [], width: 0 };
    const push = (segments: Segment[]) => {
      for (const segment of segments) {
        const last = line.segments.at(-1);
        if (last?.file === segment.file) { last.text += segment.text; last.width += segment.width; } else line.segments.push({ ...segment });
        line.width += segment.width;
      }
    };
    const newLine = () => { lines.push(line); line = { segments: [], width: 0 }; };

    for (const word of words) {
      const segments = this.segmentsOf(word, weight, size);
      const wordWidth = segments.reduce((sum, segment) => sum + segment.width, 0);
      if (word === ' ') { if (line.segments.length > 0) push(segments); continue; }
      if (line.width + wordWidth <= maxWidth || line.segments.length === 0 && wordWidth <= maxWidth) { push(segments); continue; }
      if (line.segments.length > 0) newLine();
      if (wordWidth <= maxWidth) { push(segments); continue; }
      // A single word wider than the column is broken by characters.
      for (const char of word) {
        const piece = this.segmentsOf(char, weight, size);
        const pieceWidth = piece.reduce((sum, segment) => sum + segment.width, 0);
        if (line.width + pieceWidth > maxWidth && line.segments.length > 0) newLine();
        push(piece);
      }
    }
    newLine();
    // A trailing space left by the break is harmless; trim it so right/center alignment stays exact.
    return lines.map((item) => {
      const last = item.segments.at(-1);
      if (last && last.text.endsWith(' ')) {
        const trimmed = last.text.trimEnd();
        const removed = this.widthOf(last.file, last.text, size) - (trimmed ? this.widthOf(last.file, trimmed, size) : 0);
        last.text = trimmed;
        item.width -= removed;
      }
      return { ...item, segments: item.segments.filter((segment) => segment.text.length > 0) };
    });
  }

  private layout(text: string, weight: PdfFontWeight, size: number, width: number) {
    const paragraphs = text.replace(/\r\n?/g, '\n').replace(/\t+/g, ' ').split('\n');
    return paragraphs.flatMap((paragraph) => this.breakLines(paragraph, weight, size, width));
  }

  private lineHeight(size: number, lineGap: number) {
    return size * 1.25 + lineGap;
  }

  /** Draws `text` inside a column starting at (x, y); lines are placed by hand, so pdfkit never paginates. */
  write(
    text: string,
    options: { weight?: PdfFontWeight; size: number; color: string; x: number; y: number; width: number; align?: 'left' | 'center' | 'right'; lineGap?: number },
  ) {
    const weight = options.weight ?? 400;
    const step = this.lineHeight(options.size, options.lineGap ?? 0);
    this.layout(text, weight, options.size, options.width).forEach((line, index) => {
      let x = options.x;
      if (options.align === 'center') x += (options.width - line.width) / 2;
      else if (options.align === 'right') x += options.width - line.width;
      const y = options.y + index * step;
      for (const segment of line.segments) {
        this.document.font(this.nameOf(segment.file)).fontSize(options.size).fillColor(options.color).text(segment.text, x, y, { lineBreak: false });
        x += segment.width;
      }
    });
  }

  /** Height of the text at the given width, used to size table rows before drawing them. */
  height(text: string, options: { weight?: PdfFontWeight; size: number; width: number; lineGap?: number }) {
    return Math.max(1, this.layout(text, options.weight ?? 400, options.size, options.width).length) * this.lineHeight(options.size, options.lineGap ?? 0);
  }
}
