import { z } from 'zod';
import { audioContentSchema, videoContentSchema, embedContentSchema } from '@lms/shared/longread-media';

/**
 * PR 381: the registry of longread block types. Every known type has a strict payload schema that is
 * checked on save; the payload is data (text runs, numbers), never HTML, so the reader can render it by
 * allowlist and nothing the author pastes can run. A type this server does not know yet (written by a
 * newer client or a later PR) is kept as it is instead of being dropped, so opening and saving a
 * document never loses content; it only has to be a JSON object of a sane size.
 */

export const LONGREAD_SCHEMA_VERSION = 1;
export const MAX_BLOCK_CONTENT_BYTES = 100_000;

/** Only web links, mail links and in-page anchors; `javascript:`, `data:` and the like are rejected. */
const SAFE_HREF = /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|#[A-Za-z0-9_-]+)$/i;

export const runSchema = z.object({
  text: z.string().max(20_000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  code: z.boolean().optional(),
  href: z.string().max(2048).regex(SAFE_HREF, 'Only http(s), mailto and in-page links are allowed').optional(),
}).strict();

const runsSchema = z.array(runSchema).max(500);

const paragraphSchema = z.object({ runs: runsSchema }).strict();
const headingSchema = z.object({ excludeFromToc: z.boolean().optional(), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), runs: runsSchema }).strict();
const quoteSchema = z.object({ runs: runsSchema, caption: z.string().max(500).optional() }).strict();
const noteSchema = z.object({ runs: runsSchema, tone: z.enum(['info', 'success', 'warning', 'danger']).default('info') }).strict();
const dividerSchema = z.object({}).strict();
const codeSchema = z.object({ language: z.string().trim().max(40).default('javascript'), code: z.string().max(50_000) }).strict();

export const blockTypeSchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Block type must be a lowercase identifier');

export const MAX_LIST_DEPTH = 3;
const listSchema = z.object({
  ordered: z.boolean().default(false),
  items: z.array(z.object({
    level: z.number().int().min(1).max(MAX_LIST_DEPTH),
    runs: runsSchema,
  }).strict()).max(500),
}).strict().superRefine((value, context) => {
  // A nested item needs a parent one level up: the first item starts at level 1 and a level never jumps by two.
  let previous = 0;
  value.items.forEach((item, index) => {
    if (item.level > previous + 1) context.addIssue({ code: 'custom', path: ['items', index, 'level'], message: 'A list item cannot be nested deeper than one level below the previous item' });
    previous = item.level;
  });
});


// ---- PR 384: composite blocks (table, columns, tabs, accordion) ----

export const MAX_CONTAINER_DEPTH = 3;
export const MAX_NESTED_BLOCKS = 200;
const MAX_BLOCKS_PER_SLOT = 50;
export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 12;

const tableCellSchema = z.object({
  runs: runsSchema,
  colSpan: z.number().int().min(1).max(MAX_TABLE_COLUMNS).default(1),
  rowSpan: z.number().int().min(1).max(MAX_TABLE_ROWS).default(1),
  /** True for a cell swallowed by a merged cell; its text must be empty, so merging never loses text silently. */
  covered: z.boolean().default(false),
}).strict();

const tableSchema = z.object({
  columns: z.number().int().min(1).max(MAX_TABLE_COLUMNS),
  widths: z.array(z.number().int().min(1).max(100)).max(MAX_TABLE_COLUMNS).optional(),
  headerRow: z.boolean().default(false),
  rows: z.array(z.object({ cells: z.array(tableCellSchema).min(1).max(MAX_TABLE_COLUMNS) }).strict()).min(1).max(MAX_TABLE_ROWS),
}).strict().superRefine((table, context) => {
  let failed = false;
  const fail = (message: string, path: (string | number)[] = []) => { failed = true; context.addIssue({ code: 'custom', path, message }); };
  if (table.widths && table.widths.length !== table.columns) fail('widths must have one value per column', ['widths']);
  const owner = table.rows.map((row) => row.cells.map(() => false));
  table.rows.forEach((row, r) => {
    if (row.cells.length !== table.columns) fail('Every row must have exactly `columns` cells', ['rows', r, 'cells']);
  });
  if (failed) return;
  table.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
    if (cell.covered) return;
    if (r + cell.rowSpan > table.rows.length || c + cell.colSpan > table.columns) {
      fail('A merged cell does not fit into the table', ['rows', r, 'cells', c]);
      return;
    }
    for (let dr = 0; dr < cell.rowSpan; dr++) for (let dc = 0; dc < cell.colSpan; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (owner[r + dr]![c + dc]) fail('Merged cells overlap', ['rows', r, 'cells', c]);
      owner[r + dr]![c + dc] = true;
    }
  }));
  table.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
    if (cell.covered !== owner[r]![c]) fail(cell.covered ? 'A covered cell is not inside a merged cell' : 'A cell inside a merged cell must be marked covered', ['rows', r, 'cells', c]);
    else if (cell.covered && (cell.runs.length > 0 || cell.colSpan !== 1 || cell.rowSpan !== 1)) fail('A covered cell must be empty (merging must not drop text)', ['rows', r, 'cells', c]);
  }));
});

const nestedBlockShape = z.object({
  id: z.string().uuid(),
  type: blockTypeSchema,
  schemaVersion: z.number().int().min(1).max(1000).default(LONGREAD_SCHEMA_VERSION),
  title: z.string().trim().max(200).nullable().optional(),
  hidden: z.boolean().optional(),
  content: z.unknown(),
}).strict();

const slotBlocks = z.array(z.unknown()).max(MAX_BLOCKS_PER_SLOT);
const columnsShape = z.object({
  count: z.union([z.literal(2), z.literal(3)]),
  columns: z.array(z.object({ id: z.string().uuid(), blocks: slotBlocks }).strict()).min(2).max(3),
}).strict();
const itemsShape = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    open: z.boolean().optional(),
    blocks: slotBlocks,
  }).strict()).min(1).max(12),
}).strict();

export const COMPOSITE_BLOCK_TYPES = ['table', 'columns', 'tabs', 'accordion'] as const;
const TEXT_BLOCK_TYPES = ['paragraph', 'heading', 'list', 'quote', 'note', 'divider', 'code'] as const;
const NESTABLE_TYPES = new Set<string>([...TEXT_BLOCK_TYPES, ...COMPOSITE_BLOCK_TYPES]);

type TreeState = { ids: Set<string>; count: number; selfId?: string };
type Checked<T> = { ok: true; value: T } | { ok: false; message: string };
const bad = (message: string): { ok: false; message: string } => ({ ok: false, message });
const describeIssue = (type: string, error: z.ZodError) => {
  const issue = error.issues[0]!;
  return `${type}${issue.path.length ? `.${issue.path.join('.')}` : ''}: ${issue.message}`;
};

function claimId(id: string, state: TreeState, what: string): string | null {
  if (id === state.selfId) return `${what}: a block cannot contain itself`;
  if (state.ids.has(id)) return `${what}: duplicate id ${id}`;
  state.ids.add(id);
  return null;
}

function checkSlot(blocks: unknown[], depth: number, state: TreeState, where: string): Checked<unknown[]> {
  const result: unknown[] = [];
  for (const raw of blocks) {
    const shape = nestedBlockShape.safeParse(raw);
    if (!shape.success) return bad(`${where}: ${describeIssue('block', shape.error)}`);
    const block = shape.data;
    if (!NESTABLE_TYPES.has(block.type)) return bad(`${where}: block type "${block.type}" cannot be nested`);
    if (++state.count > MAX_NESTED_BLOCKS) return bad(`${where}: at most ${MAX_NESTED_BLOCKS} nested blocks`);
    const conflict = claimId(block.id, state, where);
    if (conflict) return bad(conflict);
    const inner = validateKnown(block.type, block.content, depth, state);
    if (!inner.ok) return bad(`${where}: ${inner.message}`);
    result.push({ ...block, content: inner.value });
  }
  return { ok: true, value: result };
}

function validateKnown(type: string, content: unknown, depth: number, state: TreeState): Checked<Record<string, unknown>> {
  if (type === 'columns') {
    if (depth + 1 > MAX_CONTAINER_DEPTH) return bad(`Nesting is limited to ${MAX_CONTAINER_DEPTH} levels`);
    const parsed = columnsShape.safeParse(content);
    if (!parsed.success) return bad(describeIssue(type, parsed.error));
    if (parsed.data.columns.length !== parsed.data.count) return bad('columns: `count` must equal the number of columns');
    const columns = [];
    for (const column of parsed.data.columns) {
      const conflict = claimId(column.id, state, 'columns');
      if (conflict) return bad(conflict);
      const blocks = checkSlot(column.blocks, depth + 1, state, 'columns');
      if (!blocks.ok) return blocks;
      columns.push({ ...column, blocks: blocks.value });
    }
    return { ok: true, value: { count: parsed.data.count, columns } };
  }
  if (type === 'tabs' || type === 'accordion') {
    if (depth + 1 > MAX_CONTAINER_DEPTH) return bad(`Nesting is limited to ${MAX_CONTAINER_DEPTH} levels`);
    const parsed = itemsShape.safeParse(content);
    if (!parsed.success) return bad(describeIssue(type, parsed.error));
    const items = [];
    for (const item of parsed.data.items) {
      const conflict = claimId(item.id, state, type);
      if (conflict) return bad(conflict);
      const blocks = checkSlot(item.blocks, depth + 1, state, type);
      if (!blocks.ok) return blocks;
      items.push({ ...item, blocks: blocks.value });
    }
    return { ok: true, value: { items } };
  }
  const schema = type === 'table' ? tableSchema : KNOWN_BLOCKS[type as KnownBlockType];
  const parsed = schema.safeParse(content);
  if (!parsed.success) return bad(describeIssue(type, parsed.error));
  return { ok: true, value: parsed.data as Record<string, unknown> };
}

/** Every `id` (UUID string) anywhere in a block's content: nested blocks, tabs, columns. Used for document-wide uniqueness. */
export function collectContentIds(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => collectContentIds(item, found));
  else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'id' && typeof item === 'string') found.push(item);
      else collectContentIds(item, found);
    }
  }
  return found;
}

export const imageContentSchema = z.object({
  fileId: z.string().uuid().nullable().default(null), alt: z.string().max(2000).default(''),
  caption: z.string().max(2000).default(''), width: z.number().int().min(10).max(100).default(100),
  align: z.enum(['start', 'center', 'end']).default('center'),
}).strict();
const attachmentsSchema = z.object({ files: z.array(z.object({ fileId: z.string().uuid(), label: z.string().max(255).optional() }).strict()) }).strict();

const KNOWN_BLOCKS = {
  audio: audioContentSchema, video: videoContentSchema, embed: embedContentSchema,
  image: imageContentSchema, attachments: attachmentsSchema,
  paragraph: paragraphSchema,
  heading: headingSchema,
  list: listSchema,
  quote: quoteSchema,
  note: noteSchema,
  divider: dividerSchema,
  code: codeSchema,
} as const;

export type KnownBlockType = keyof typeof KNOWN_BLOCKS;
export const KNOWN_BLOCK_TYPES = [...(Object.keys(KNOWN_BLOCKS) as KnownBlockType[]), ...COMPOSITE_BLOCK_TYPES];


export function isKnownBlockType(type: string): boolean {
  return Object.hasOwn(KNOWN_BLOCKS, type) || (COMPOSITE_BLOCK_TYPES as readonly string[]).includes(type);
}

export type BlockValidation = { ok: true; content: Record<string, unknown>; known: boolean } | { ok: false; message: string };

/**
 * Validates (and normalises, for known types) one block payload. `blockId` is the block's own id when it already has one:
 * a composite block that contains that id would contain itself, which is rejected.
 */
export function validateBlockContent(type: string, content: unknown, blockId?: string): BlockValidation {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return { ok: false, message: 'Block content must be an object' };
  if (Buffer.byteLength(JSON.stringify(content), 'utf8') > MAX_BLOCK_CONTENT_BYTES) return { ok: false, message: 'Block content is too large' };
  if (!isKnownBlockType(type)) return { ok: true, content: content as Record<string, unknown>, known: false };

  const checked = validateKnown(type, content, 0, { ids: new Set(), count: 0, selfId: blockId });
  if (!checked.ok) return { ok: false, message: checked.message };
  return { ok: true, content: checked.value, known: true };
}
