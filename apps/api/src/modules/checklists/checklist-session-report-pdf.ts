import { checklistLabel } from '@lms/shared/checklist-numbering';
import { isRichDescription, descriptionRuns, descriptionText, type DescriptionRun } from '@lms/shared/checklist-description';
import { feedbackRows, isCustomFeedback } from '@lms/shared/checklist-feedback';
import PDFDocument from 'pdfkit';

import type { HighlightStyle } from './checklist-colors.js';
import { PdfFontBook, type PdfFontWeight } from './checklist-report-pdf-fonts.js';
import { PDF_LABELS, type PdfLabels, type PdfLocale } from './checklist-session-report-pdf-labels.js';
import type { ChecklistSessionReport } from './checklist-session-report.js';

export type ReportPdfPhoto = { criterionId: string; buffer: Buffer; mimeType: string } | { criterionId: string; buffer: null; mimeType: null };

export type ReportPdfOptions = {
  locale: PdfLocale;
  /** Photos that fit the limits, one per criterion that has a photo; `buffer: null` marks a photo that could not be read. */
  photos: ReportPdfPhoto[];
  /** Photos left out because of the size/count limits; the file says how many. */
  omittedPhotos: number;
  /** Tests switch compression off to read colours out of the content streams. */
  compress?: boolean;
  /** Tests collect every text the file prints here. */
  trace?: string[];
};

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const BOTTOM = PAGE.height - PAGE.margin - 8;
const INK = '#172033';
const MUTED = '#475569';
const TRACK = '#E2E8F0';
const NEUTRAL_STRIPE = '#CBD5E1';
/** Photos sit inside the criterion row (as in the reference), scaled to the detail column and this height. */
const THUMB_MAX_HEIGHT = 72;

type Highlight = HighlightStyle | null;
type Criterion = Extract<ChecklistSessionReport, { visible: true }>['criteria'][number];

function criterionStatus(criterion: Pick<Criterion, 'state' | 'score' | 'maxScore'>) {
  if (criterion.state === 'skipped') return 'skipped' as const;
  if (criterion.state !== 'answered') return 'unanswered' as const;
  const score = criterion.score ?? 0;
  if (score <= 0) return 'zero' as const;
  return criterion.maxScore !== null && score >= criterion.maxScore ? ('full' as const) : ('partial' as const);
}

const formatNumber = (value: number) => String(Math.round(value * 100) / 100);

/**
 * PR 372: the detailed session report as a PDF. It renders the object `buildSessionReport` made --
 * it never calculates a score, a percentage or a colour itself -- so the file always agrees with the
 * screen. Status icons are drawn as vectors, not typed as glyphs, so they never depend on a font and
 * stay readable in black and white (a tick, a triangle, a cross, a dash and a dot differ by shape).
 */
export function renderSessionReportPdf(report: ChecklistSessionReport, options: ReportPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const labels = PDF_LABELS[options.locale];
    const document = new PDFDocument({
      size: 'A4', margin: PAGE.margin, bufferPages: true, compress: options.compress ?? true,
      info: { Title: `${labels.title}: ${report.checklist.title}`, Author: 'LMS', Subject: labels.title },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    try {
      new ReportPainter(document, report, labels, options).paint();
      document.end();
    } catch (error) {
      reject(error);
    }
  });
}

class ReportPainter {
  private readonly fonts: PdfFontBook;
  private y = PAGE.margin;

  constructor(
    private readonly doc: InstanceType<typeof PDFDocument>,
    private readonly report: ChecklistSessionReport,
    private readonly labels: PdfLabels,
    private readonly options: ReportPdfOptions,
  ) {
    this.fonts = new PdfFontBook(doc);
  }

  paint() {
    this.header();
    if (!this.report.visible) {
      this.paragraph(this.labels.hidden, { size: 11, color: MUTED });
    } else {
      this.summary();
      this.generalInfo();
      this.groups();
      this.criteriaTable();
      this.descriptions();
      this.omittedPhotosNote();
      this.feedback();
    }
    this.footers();
  }

  // ---- text helpers ----
  private text(value: string, x: number, width: number, style: { rich?: boolean; weight?: PdfFontWeight; size: number; color?: string; align?: 'left' | 'center' | 'right' }, y = this.y) {
    this.options.trace?.push(style.rich ? descriptionText(value) : value);
    if (style.rich && isRichDescription(value)) { this.richLines(value, width, style, { x, y }); return; }
    this.fonts.write(value, { weight: style.weight, size: style.size, color: style.color ?? INK, x, y, width, align: style.align, lineGap: 2 });
  }

  private measure(value: string, width: number, style: { rich?: boolean; weight?: PdfFontWeight; size: number }) {
    if (style.rich && isRichDescription(value)) return this.richLines(value, width, style);
    return this.fonts.height(value, { weight: style.weight, size: style.size, width, lineGap: 2 });
  }

  private richLines(value: string, width: number, style: { rich?: boolean; weight?: PdfFontWeight; size: number; color?: string }, at?: { x: number; y: number }) {
    let x = 0, y = 0, lineHeight = style.size * 1.35 + 2;
    for (const run of descriptionRuns(value)) {
      const size = run.size ? run.size * 0.75 : style.size, weight = run.bold ? 700 : style.weight;
      const tokens = (run.uppercase ? run.text.toUpperCase() : run.text).match(/\n|[^\S\n]+|[^\s]+/gu) ?? [];
      const draw = (text: string) => {
        const length = this.fonts.inlineWidth(text, weight ?? 400, size);
        if (x && x + length > width) { y += lineHeight; x = 0; lineHeight = style.size * 1.35 + 2; }
        lineHeight = Math.max(lineHeight, size * 1.35 + 2);
        if (at) this.fonts.writeInline(text, { weight: weight ?? 400, size, color: run.color ?? style.color ?? INK, x: at.x + x, y: at.y + y, italic: run.italic, underline: run.underline });
        x += length;
      };
      for (const token of tokens) {
        if (token === '\n') { y += lineHeight; x = 0; lineHeight = style.size * 1.35 + 2; }
        else if (this.fonts.inlineWidth(token, weight ?? 400, size) > width) for (const char of token) draw(char);
        else draw(token);
      }
    }
    return y + lineHeight;
  }

  private ensureSpace(height: number) {
    if (this.y + height <= BOTTOM) return;
    this.doc.addPage();
    this.y = PAGE.margin;
  }

  private paragraph(value: string, style: { rich?: boolean; weight?: PdfFontWeight; size: number; color?: string }, x = PAGE.margin, width = CONTENT_WIDTH) {
    const height = this.measure(value, width, style);
    this.ensureSpace(height);
    this.text(value, x, width, style);
    this.y += height + 4;
  }

  private section(title: string) {
    const height = Math.max(20, this.measure(title, CONTENT_WIDTH, { rich: true, weight: 700, size: 13 }) + 4);
    this.ensureSpace(height + 14);
    this.y += 8;
    this.text(title, PAGE.margin, CONTENT_WIDTH, { rich: true, weight: 700, size: 13 });
    this.y += height;
    this.doc.moveTo(PAGE.margin, this.y - 4).lineTo(PAGE.margin + CONTENT_WIDTH, this.y - 4).lineWidth(0.6).strokeColor(TRACK).stroke();
  }

  private date(value: Date | string | null) {
    if (!value) return this.labels.empty;
    try {
      return new Intl.DateTimeFormat(this.options.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: this.report.header.timezone }).format(new Date(value));
    } catch {
      return new Date(value).toISOString();
    }
  }

  private person(person: { firstName: string; lastName: string; email: string; department: { name: string } | null }) {
    return `${person.firstName} ${person.lastName}`.trim() || person.email;
  }

  // ---- blocks ----
  private header() {
    const { header, checklist } = this.report;
    this.text(this.labels.title.toUpperCase(), PAGE.margin, CONTENT_WIDTH, { weight: 700, size: 9, color: MUTED });
    this.y += 14;
    const titleHeight = this.measure(checklist.title, CONTENT_WIDTH, { rich: true, weight: 700, size: 20 });
    this.text(checklist.title, PAGE.margin, CONTENT_WIDTH, { rich: true, weight: 700, size: 20 });
    this.y += titleHeight + 8;

    const rows: Array<[string, string]> = [
      [this.labels.learner, this.person(header.learner)],
      [this.labels.department, header.learner.department?.name ?? this.labels.empty],
      [this.labels.observer, this.person(header.observer)],
      [this.labels.status, this.labels.statuses[header.status] ?? header.status],
      [this.labels.scheduled, this.date(header.scheduledStart)],
      [this.labels.started, this.date(header.startedAt)],
      [this.labels.completed, this.date(header.completedAt)],
      [this.labels.timezone, header.timezone],
    ];
    const columnWidth = CONTENT_WIDTH / 2 - 8;
    for (let index = 0; index < rows.length; index += 2) {
      const pair = rows.slice(index, index + 2);
      const heights = pair.map(([, value]) => this.measure(value, columnWidth - 100, { size: 10 }));
      const rowHeight = Math.max(14, ...heights) + 4;
      this.ensureSpace(rowHeight);
      pair.forEach(([label, value], column) => {
        const x = PAGE.margin + column * (columnWidth + 16);
        this.text(label, x, 96, { size: 9, color: MUTED });
        this.text(value, x + 100, columnWidth - 100, { size: 10 });
      });
      this.y += rowHeight;
    }
    this.y += 4;
  }

  private ring(cx: number, cy: number, radius: number, percentage: number | null, color: string) {
    const doc = this.doc;
    doc.lineWidth(9).strokeColor(TRACK).circle(cx, cy, radius).stroke();
    if (percentage === null || percentage <= 0) return;
    doc.lineWidth(9).strokeColor(color);
    if (percentage >= 100) {
      doc.circle(cx, cy, radius).stroke();
      return;
    }
    const angle = (Math.min(percentage, 100) / 100) * Math.PI * 2;
    const endX = cx + radius * Math.sin(angle);
    const endY = cy - radius * Math.cos(angle);
    doc.path(`M ${cx} ${cy - radius} A ${radius} ${radius} 0 ${angle > Math.PI ? 1 : 0} 1 ${endX} ${endY}`).stroke();
  }

  private summary() {
    if (!this.report.visible || !this.report.summary) return;
    const { summary } = this.report;
    const blockHeight = 96;
    this.ensureSpace(blockHeight + 10);
    const top = this.y + 4;
    const cx = PAGE.margin + 48;
    const cy = top + 44;
    if (summary.scoringMode === 'none') {
      // PR 416: a sheet without points has no ring, percentage, points or verdict -- only "Completed" and the answer count.
      const x = PAGE.margin;
      const width = CONTENT_WIDTH;
      this.text(this.labels.finished, x, width, { weight: 700, size: 15 }, top + 4);
      this.text(this.labels.ofCriteria(summary.answeredCount, summary.criteriaCount - summary.skippedCount), x, width, { size: 11 }, top + 28);
      this.text(`${this.labels.skipped}: ${summary.skippedCount}`, x, width, { size: 10, color: MUTED }, top + 46);
      this.y = top + 66;
      return;
    }
    const color = summary.color?.color ?? NEUTRAL_STRIPE;
    this.ring(cx, cy, 36, summary.scored ? summary.percentage : null, color);
    const percentLabel = summary.scored && summary.percentage !== null ? `${summary.percentage}%` : '–';
    this.text(percentLabel, cx - 30, 60, { weight: 700, size: 17, align: 'center' }, cy - 10);

    const x = PAGE.margin + 120;
    const width = CONTENT_WIDTH - 120;
    if (this.report.pointsVisible !== false) this.text(`${this.labels.points}: ${formatNumber(summary.totalScore)} / ${formatNumber(summary.maxScore)}`, x, width, { weight: 700, size: 13 }, top + 2);
    let verdict = this.labels.notScored;
    if (summary.scored && summary.passed === true) verdict = this.labels.passed;
    else if (summary.scored && summary.passed === false) verdict = this.labels.notPassed;
    this.text(verdict, x + 18, width - 18, { weight: 700, size: 11 }, top + 24);
    if (summary.scored && summary.passed !== null) this.statusIcon(x + 7, top + 31, summary.passed ? 'full' : 'zero', summary.color?.color ?? INK, 6);
    const counts = [
      `${this.labels.answered}: ${summary.answeredCount}`,
      `${this.labels.skipped}: ${summary.skippedCount}`,
      `${this.labels.criteria}: ${summary.criteriaCount}`,
    ];
    if (summary.passThreshold !== null && summary.passThreshold !== undefined) counts.push(`${this.labels.threshold}: ${summary.passThreshold}%`);
    this.text(counts.join('   '), x, width, { size: 10, color: MUTED }, top + 46);
    this.text(summary.formula === 'criteria' ? this.labels.formula.criteria : this.labels.formula.snapshot, x, width, { size: 9, color: MUTED }, top + 62);
    this.y = top + blockHeight - 4;
  }

  private generalInfo() {
    if (!this.report.visible) return;
    const entries = this.report.generalInfo.filter((entry) => entry.value);
    if (entries.length === 0) return;
    this.section(this.labels.generalInfo);
    for (const entry of entries) {
      const valueWidth = CONTENT_WIDTH - 170;
      const height = Math.max(this.measure(entry.value!, valueWidth, { rich: true, size: 10 }), this.measure(entry.label, 160, { rich: true, size: 9 })) + 4;
      this.ensureSpace(height);
      this.text(entry.label, PAGE.margin, 160, { rich: true, size: 9, color: MUTED });
      this.text(entry.value!, PAGE.margin + 170, valueWidth, { rich: true, size: 10 });
      this.y += height;
    }
  }

  private groups() {
    if (!this.report.visible || this.report.groups.length === 0 || this.report.summary?.scoringMode === 'none') return;
    this.section(this.labels.groups);
    for (const group of this.report.groups) {
      const titleWidth = 250;
      const title = checklistLabel(group.title, group.number ? `${group.number}.` : '', this.report.checklist.showNumbering);
      const height = Math.max(22, this.measure(title, titleWidth, { rich: true, size: 10 }) + 6);
      this.ensureSpace(height + 4);
      const color = group.color?.color ?? NEUTRAL_STRIPE;
      this.doc.rect(PAGE.margin, this.y, 4, height).fill(color);
      this.text(title, PAGE.margin + 12, titleWidth, { rich: true, size: 10 }, this.y + 3);
      const barX = PAGE.margin + 275;
      const barWidth = 130;
      this.doc.rect(barX, this.y + 5, barWidth, 9).fill(TRACK);
      if (group.percentage !== null && group.percentage > 0) this.doc.rect(barX, this.y + 5, barWidth * Math.min(group.percentage, 100) / 100, 9).fill(color);
      const label = this.report.pointsVisible === false ? (group.percentage === null ? '–' : `${group.percentage}%`) : group.percentage === null ? `${formatNumber(group.score)} / ${formatNumber(group.maxScore)}` : `${group.percentage}%  (${formatNumber(group.score)} / ${formatNumber(group.maxScore)})`;
      this.text(label, barX + barWidth + 8, PAGE.margin + CONTENT_WIDTH - (barX + barWidth + 8), { size: 9, color: MUTED }, this.y + 4);
      this.y += height + 4;
    }
  }

  /** Vector status icons: ✓ full, triangle partial, ✕ zero, dash skipped, dot unanswered. */
  private statusIcon(cx: number, cy: number, status: ReturnType<typeof criterionStatus>, color: string, size = 5) {
    const doc = this.doc.save().strokeColor(color).fillColor(color).lineWidth(1.6).lineCap('round').lineJoin('round');
    if (status === 'full') {
      doc.moveTo(cx - size, cy).lineTo(cx - size / 3, cy + size * 0.8).lineTo(cx + size, cy - size * 0.8).stroke();
    } else if (status === 'partial') {
      doc.lineWidth(1.4).moveTo(cx, cy - size).lineTo(cx + size, cy + size * 0.8).lineTo(cx - size, cy + size * 0.8).closePath().stroke();
      doc.lineWidth(1.4).moveTo(cx, cy - size * 0.3).lineTo(cx, cy + size * 0.2).stroke();
      doc.circle(cx, cy + size * 0.55, 0.5).fill(color);
    } else if (status === 'zero') {
      doc.moveTo(cx - size * 0.8, cy - size * 0.8).lineTo(cx + size * 0.8, cy + size * 0.8).stroke();
      doc.moveTo(cx + size * 0.8, cy - size * 0.8).lineTo(cx - size * 0.8, cy + size * 0.8).stroke();
    } else if (status === 'skipped') {
      doc.moveTo(cx - size * 0.8, cy).lineTo(cx + size * 0.8, cy).stroke();
    } else {
      doc.circle(cx, cy, 1.8).fill(color);
    }
    doc.restore();
  }

  private criteriaTable() {
    if (!this.report.visible) return;
    this.section(this.labels.criteria);
    const column = { stripe: PAGE.margin, text: PAGE.margin + 12, score: PAGE.margin + 262, detail: PAGE.margin + 372 };
    const widths = { text: 244, score: 104, detail: PAGE.margin + CONTENT_WIDTH - (PAGE.margin + 372) };

    const withoutPoints = this.report.summary?.scoringMode === 'none' || this.report.pointsVisible === false;
    const drawHead = () => {
      this.ensureSpace(24);
      this.text(this.labels.criterion, column.text, widths.text, { weight: 700, size: 9, color: MUTED });
      this.text(withoutPoints ? this.labels.status : this.labels.score, column.score, widths.score, { weight: 700, size: 9, color: MUTED });
      this.text(`${this.labels.level} / ${this.labels.comment}`, column.detail, widths.detail, { weight: 700, size: 9, color: MUTED });
      this.y += 16;
    };
    drawHead();

    const photos = new Map(this.options.photos.map((photo) => [photo.criterionId, photo]));
    for (const criterion of this.report.criteria) {
      const highlight: Highlight = criterion.color;
      const status = criterionStatus(criterion);
      const ink = highlight?.light.text ?? INK;
      const title = checklistLabel(criterion.text, criterion.number, this.report.checklist.showNumbering, '  ');
      const scoreText = withoutPoints
        ? (criterion.state === 'skipped' ? this.labels.skippedCriterion : criterion.state === 'answered' ? this.labels.answered : this.labels.unanswered)
        : criterion.score === null || criterion.maxScore === null
          ? this.labels.skippedCriterion : `${formatNumber(criterion.score)} / ${formatNumber(criterion.maxScore)}`;
      const level = criterion.levelLabel ?? '';
      const photo = criterion.photo ? this.thumbnail(photos.get(criterion.id), widths.detail) : null;
      const fileLine = criterion.photo?.fileName ?? '';
      const photoLine = !criterion.photo || photo?.drawn ? null
        : photo?.unavailable ? this.labels.photoUnavailable : `${this.labels.photoFile}: ${fileLine}`.trim();
      const detailParts = [
        level ? { value: level, weight: 700 as PdfFontWeight, rich: false } : null,
        // PR 428: the comment keeps its formatting; plain legacy comments keep their line breaks.
        criterion.comment?.trim() ? { value: criterion.comment, weight: 400 as PdfFontWeight, rich: true } : null,
        photoLine ? { value: photoLine, weight: 400 as PdfFontWeight, rich: false } : null,
      ].filter((part): part is { value: string; weight: PdfFontWeight; rich: boolean } => part !== null);
      const textHeight = detailParts.reduce((sum, part) => sum + this.measure(part.value, widths.detail, { weight: part.weight, size: 9, rich: part.rich }) + 2, 0);
      const detailHeight = textHeight + (photo?.drawn ? photo.height + 4 : 0);
      const height = Math.max(this.measure(title, widths.text, { rich: true, size: 10 }), detailHeight, 16) + 12;

      if (this.y + height > BOTTOM) {
        this.doc.addPage();
        this.y = PAGE.margin;
        drawHead();
      }
      if (highlight) this.doc.rect(column.stripe, this.y, CONTENT_WIDTH, height).fill(highlight.light.fill);
      this.doc.rect(column.stripe, this.y, 4, height).fill(highlight?.color ?? NEUTRAL_STRIPE);
      const top = this.y + 6;
      this.text(title, column.text, widths.text, { rich: true, size: 10, color: ink }, top);
      this.statusIcon(column.score + 5, top + 6, status, highlight?.color ?? ink);
      this.text(scoreText, column.score + 16, widths.score - 16, { weight: 700, size: 10, color: ink }, top);
      let detailY = top;
      for (const part of detailParts) {
        this.text(part.value, column.detail, widths.detail, { weight: part.weight, size: 9, color: ink, rich: part.rich }, detailY);
        detailY += this.measure(part.value, widths.detail, { weight: part.weight, size: 9, rich: part.rich }) + 2;
      }
      if (photo?.drawn) this.doc.image(photo.buffer, column.detail, detailY + 2, { width: photo.width, height: photo.height });
      this.y += height;
      this.doc.moveTo(column.stripe, this.y).lineTo(column.stripe + CONTENT_WIDTH, this.y).lineWidth(0.4).strokeColor(TRACK).stroke();
    }
    this.y += 6;
  }

  private richParagraph(value: string) {
    this.options.trace?.push(descriptionText(value));
    let parts: Array<{ text: string; run: DescriptionRun; size: number; width: number }> = [], width = 0;
    const flush = () => {
      const size = Math.max(12, ...parts.map((part) => part.size)), height = size * 1.35 + 3;
      this.ensureSpace(height); let x = PAGE.margin;
      for (const part of parts) {
        this.fonts.writeInline(part.text, { weight: part.run.bold ? 700 : 400, size: part.size, color: part.run.color ?? INK, x, y: this.y + (size - part.size) * 0.8, italic: part.run.italic, underline: part.run.underline });
        x += part.width;
      }
      this.y += height; parts = []; width = 0;
    };
    for (const run of descriptionRuns(value)) {
      const size = (run.size ?? 16) * 0.75;
      const add = (text: string) => {
        const measured = this.fonts.inlineWidth(text, run.bold ? 700 : 400, size);
        if (width + measured > CONTENT_WIDTH && parts.length) flush();
        parts.push({ text, run, size, width: measured }); width += measured;
      };
      for (const token of (run.uppercase ? run.text.toUpperCase() : run.text).match(/\n|[^\S\n]+|[^\s]+/gu) ?? []) {
        if (token === '\n') { flush(); continue; }
        if (this.fonts.inlineWidth(token, run.bold ? 700 : 400, size) > CONTENT_WIDTH) for (const character of token) add(character);
        else add(token);
      }
    }
    if (parts.length) flush();
    this.y += 4;
  }

  private descriptions() {
    if (!this.report.visible) return;
    const descriptions = [
      ...(this.report.checklist.description ? [{ title: this.report.checklist.title, value: this.report.checklist.description }] : []),
      ...this.report.criteria.flatMap((criterion) => [criterion.description, criterion.levelDescription].filter((value): value is string => !!value).map((value) => ({ title: checklistLabel(criterion.text, criterion.number, this.report.checklist.showNumbering), value }))),
    ];
    if (!descriptions.length) return;
    this.section({ ru: 'Описание', en: 'Description', kk: 'Сипаттама', zh: '描述' }[this.options.locale]);
    for (const description of descriptions) { this.paragraph(description.title, { rich: true, weight: 700, size: 10 }); this.richParagraph(description.value); }
  }

  private feedback() {
    if (!this.report.visible) return;
    const form = this.report.feedbackForm;
    if (form && isCustomFeedback(form.layout)) {
      const rows = feedbackRows(form, form.answers, this.labels);
      if (!rows.some((row) => row.kind === 'field' && row.value)) return;
      this.section(form.layout.title || this.labels.feedback);
      for (const row of rows) {
        this.ensureSpace(24);
        const indent = row.depth * 10;
        if (row.kind === 'section') this.paragraph(row.title, { rich: true, weight: 700, size: 10 }, PAGE.margin + indent, CONTENT_WIDTH - indent);
        else { this.paragraph(row.title, { rich: true, weight: 700, size: 9, color: MUTED }, PAGE.margin + indent, CONTENT_WIDTH - indent); this.paragraph(row.value || '—', { rich: true, size: 10 }, PAGE.margin + indent, CONTENT_WIDTH - indent); }
      }
      return;
    }
    if (!this.report.feedback) return;
    const { strengths, developmentAreas, comment } = this.report.feedback;
    const blocks: Array<[string, string | null]> = [
      [this.labels.strengths, strengths], [this.labels.developmentAreas, developmentAreas], [this.labels.nextSteps, comment],
    ];
    if (blocks.every(([, value]) => !value)) return;
    this.section(this.labels.feedback);
    for (const [label, value] of blocks) {
      if (!value) continue;
      this.ensureSpace(24);
      this.text(label, PAGE.margin, CONTENT_WIDTH, { weight: 700, size: 9, color: MUTED });
      this.y += 13;
      this.paragraph(value, { rich: true, size: 10 });
    }
  }

  /** Decodes a criterion's photo and sizes its thumbnail; `unavailable` when it could not be read or decoded. */
  private thumbnail(photo: ReportPdfPhoto | undefined, maxWidth: number):
    | { drawn: true; buffer: Buffer; width: number; height: number }
    | { drawn: false; unavailable: boolean } {
    if (!photo) return { drawn: false, unavailable: false };
    if (!photo.buffer) return { drawn: false, unavailable: true };
    try {
      const opened = (this.doc as unknown as { openImage(source: Buffer): { width: number; height: number } }).openImage(photo.buffer);
      const scale = Math.min(maxWidth / opened.width, THUMB_MAX_HEIGHT / opened.height, 1);
      return { drawn: true, buffer: photo.buffer, width: opened.width * scale, height: opened.height * scale };
    } catch {
      return { drawn: false, unavailable: true };
    }
  }

  private omittedPhotosNote() {
    if (this.options.omittedPhotos > 0) this.paragraph(this.labels.photosOmitted(this.options.omittedPhotos), { size: 9, color: MUTED });
  }

  private footers() {
    const range = this.doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      this.doc.switchToPage(range.start + index);
      // Without this pdfkit would add a page for text below the bottom margin.
      this.doc.page.margins.bottom = 0;
      this.text(this.labels.page(index + 1, range.count), PAGE.margin, CONTENT_WIDTH, { size: 8, color: MUTED, align: 'right' }, PAGE.height - 30);
    }
  }
}
