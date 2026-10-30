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
      this.omittedPhotosNote();
      this.feedback();
    }
    this.footers();
  }

  // ---- text helpers ----
  private text(value: string, x: number, width: number, style: { weight?: PdfFontWeight; size: number; color?: string; align?: 'left' | 'center' | 'right' }, y = this.y) {
    this.options.trace?.push(value);
    this.fonts.write(value, { weight: style.weight, size: style.size, color: style.color ?? INK, x, y, width, align: style.align, lineGap: 2 });
  }

  private measure(value: string, width: number, style: { weight?: PdfFontWeight; size: number }) {
    return this.fonts.height(value, { weight: style.weight, size: style.size, width, lineGap: 2 });
  }

  private ensureSpace(height: number) {
    if (this.y + height <= BOTTOM) return;
    this.doc.addPage();
    this.y = PAGE.margin;
  }

  private paragraph(value: string, style: { weight?: PdfFontWeight; size: number; color?: string }, x = PAGE.margin, width = CONTENT_WIDTH) {
    const height = this.measure(value, width, style);
    this.ensureSpace(height);
    this.text(value, x, width, style);
    this.y += height + 4;
  }

  private section(title: string) {
    this.ensureSpace(34);
    this.y += 8;
    this.text(title, PAGE.margin, CONTENT_WIDTH, { weight: 700, size: 13 });
    this.y += 20;
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
    const titleHeight = this.measure(checklist.title, CONTENT_WIDTH, { weight: 700, size: 20 });
    this.text(checklist.title, PAGE.margin, CONTENT_WIDTH, { weight: 700, size: 20 });
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
    const color = summary.color?.color ?? NEUTRAL_STRIPE;
    this.ring(cx, cy, 36, summary.scored ? summary.percentage : null, color);
    const percentLabel = summary.scored && summary.percentage !== null ? `${summary.percentage}%` : '–';
    this.text(percentLabel, cx - 30, 60, { weight: 700, size: 17, align: 'center' }, cy - 10);

    const x = PAGE.margin + 120;
    const width = CONTENT_WIDTH - 120;
    this.text(`${this.labels.points}: ${formatNumber(summary.totalScore)} / ${formatNumber(summary.maxScore)}`, x, width, { weight: 700, size: 13 }, top + 2);
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
      const height = Math.max(this.measure(entry.value!, valueWidth, { size: 10 }), this.measure(entry.label, 160, { size: 9 })) + 4;
      this.ensureSpace(height);
      this.text(entry.label, PAGE.margin, 160, { size: 9, color: MUTED });
      this.text(entry.value!, PAGE.margin + 170, valueWidth, { size: 10 });
      this.y += height;
    }
  }

  private groups() {
    if (!this.report.visible || this.report.groups.length === 0) return;
    this.section(this.labels.groups);
    for (const group of this.report.groups) {
      const titleWidth = 250;
      const title = `${group.number}. ${group.title}`;
      const height = Math.max(22, this.measure(title, titleWidth, { size: 10 }) + 6);
      this.ensureSpace(height + 4);
      const color = group.color?.color ?? NEUTRAL_STRIPE;
      this.doc.rect(PAGE.margin, this.y, 4, height).fill(color);
      this.text(title, PAGE.margin + 12, titleWidth, { size: 10 }, this.y + 3);
      const barX = PAGE.margin + 275;
      const barWidth = 130;
      this.doc.rect(barX, this.y + 5, barWidth, 9).fill(TRACK);
      if (group.percentage !== null && group.percentage > 0) this.doc.rect(barX, this.y + 5, barWidth * Math.min(group.percentage, 100) / 100, 9).fill(color);
      const label = group.percentage === null ? `${formatNumber(group.score)} / ${formatNumber(group.maxScore)}` : `${group.percentage}%  (${formatNumber(group.score)} / ${formatNumber(group.maxScore)})`;
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

    const drawHead = () => {
      this.ensureSpace(24);
      this.text(this.labels.criterion, column.text, widths.text, { weight: 700, size: 9, color: MUTED });
      this.text(this.labels.score, column.score, widths.score, { weight: 700, size: 9, color: MUTED });
      this.text(`${this.labels.level} / ${this.labels.comment}`, column.detail, widths.detail, { weight: 700, size: 9, color: MUTED });
      this.y += 16;
    };
    drawHead();

    const photos = new Map(this.options.photos.map((photo) => [photo.criterionId, photo]));
    for (const criterion of this.report.criteria) {
      const highlight: Highlight = criterion.color;
      const status = criterionStatus(criterion);
      const ink = highlight?.light.text ?? INK;
      const title = `${criterion.number}  ${criterion.text}`;
      const scoreText = criterion.score === null || criterion.maxScore === null
        ? this.labels.skippedCriterion : `${formatNumber(criterion.score)} / ${formatNumber(criterion.maxScore)}`;
      const level = criterion.levelLabel ?? '';
      const photo = criterion.photo ? this.thumbnail(photos.get(criterion.id), widths.detail) : null;
      const fileLine = criterion.photo?.fileName ?? '';
      const photoLine = !criterion.photo || photo?.drawn ? null
        : photo?.unavailable ? this.labels.photoUnavailable : `${this.labels.photoFile}: ${fileLine}`.trim();
      const detailParts = [
        level ? { value: level, weight: 700 as PdfFontWeight } : null,
        ...(criterion.comment ?? '').split('\n').filter(Boolean).map((value) => ({ value, weight: 400 as PdfFontWeight })),
        photoLine ? { value: photoLine, weight: 400 as PdfFontWeight } : null,
      ].filter((part): part is { value: string; weight: PdfFontWeight } => part !== null);
      const textHeight = detailParts.reduce((sum, part) => sum + this.measure(part.value, widths.detail, { weight: part.weight, size: 9 }) + 2, 0);
      const detailHeight = textHeight + (photo?.drawn ? photo.height + 4 : 0);
      const height = Math.max(this.measure(title, widths.text, { size: 10 }), detailHeight, 16) + 12;

      if (this.y + height > BOTTOM) {
        this.doc.addPage();
        this.y = PAGE.margin;
        drawHead();
      }
      if (highlight) this.doc.rect(column.stripe, this.y, CONTENT_WIDTH, height).fill(highlight.light.fill);
      this.doc.rect(column.stripe, this.y, 4, height).fill(highlight?.color ?? NEUTRAL_STRIPE);
      const top = this.y + 6;
      this.text(title, column.text, widths.text, { size: 10, color: ink }, top);
      this.statusIcon(column.score + 5, top + 6, status, highlight?.color ?? ink);
      this.text(scoreText, column.score + 16, widths.score - 16, { weight: 700, size: 10, color: ink }, top);
      let detailY = top;
      for (const part of detailParts) {
        this.text(part.value, column.detail, widths.detail, { weight: part.weight, size: 9, color: ink }, detailY);
        detailY += this.measure(part.value, widths.detail, { weight: part.weight, size: 9 }) + 2;
      }
      if (photo?.drawn) this.doc.image(photo.buffer, column.detail, detailY + 2, { width: photo.width, height: photo.height });
      this.y += height;
      this.doc.moveTo(column.stripe, this.y).lineTo(column.stripe + CONTENT_WIDTH, this.y).lineWidth(0.4).strokeColor(TRACK).stroke();
    }
    this.y += 6;
  }

  private feedback() {
    if (!this.report.visible || !this.report.feedback) return;
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
      this.paragraph(value, { size: 10 });
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
