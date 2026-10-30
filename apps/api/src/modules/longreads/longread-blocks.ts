import { z } from 'zod';

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
const headingSchema = z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]), runs: runsSchema }).strict();
const quoteSchema = z.object({ runs: runsSchema, caption: z.string().max(500).optional() }).strict();
const noteSchema = z.object({ runs: runsSchema, tone: z.enum(['info', 'success', 'warning', 'danger']).default('info') }).strict();
const dividerSchema = z.object({}).strict();
const codeSchema = z.object({ language: z.string().trim().max(40).default('javascript'), code: z.string().max(50_000) }).strict();

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

const KNOWN_BLOCKS = {
  paragraph: paragraphSchema,
  heading: headingSchema,
  list: listSchema,
  quote: quoteSchema,
  note: noteSchema,
  divider: dividerSchema,
  code: codeSchema,
} as const;

export type KnownBlockType = keyof typeof KNOWN_BLOCKS;
export const KNOWN_BLOCK_TYPES = Object.keys(KNOWN_BLOCKS) as KnownBlockType[];

export const blockTypeSchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Block type must be a lowercase identifier');

export function isKnownBlockType(type: string): type is KnownBlockType {
  return Object.hasOwn(KNOWN_BLOCKS, type);
}

export type BlockValidation = { ok: true; content: Record<string, unknown>; known: boolean } | { ok: false; message: string };

/** Validates (and normalises, for known types) one block payload. */
export function validateBlockContent(type: string, content: unknown): BlockValidation {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return { ok: false, message: 'Block content must be an object' };
  if (Buffer.byteLength(JSON.stringify(content), 'utf8') > MAX_BLOCK_CONTENT_BYTES) return { ok: false, message: 'Block content is too large' };
  if (!isKnownBlockType(type)) return { ok: true, content: content as Record<string, unknown>, known: false };

  const parsed = KNOWN_BLOCKS[type].safeParse(content);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return { ok: false, message: `${type}${issue.path.length ? `.${issue.path.join('.')}` : ''}: ${issue.message}` };
  }
  return { ok: true, content: parsed.data as Record<string, unknown>, known: true };
}
