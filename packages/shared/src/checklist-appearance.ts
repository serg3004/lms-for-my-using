/** PR 422: how the blocks of a sheet look (header, general information, group, criterion card). */
export const APPEARANCE_RADII = [0, 6, 12, 20] as const;
export const APPEARANCE_PADDINGS = [8, 12, 16, 24] as const;
export const APPEARANCE_BORDER_MAX = 4;
export const APPEARANCE_OVERRIDES_MAX = 300;
export const APPEARANCE_MARKUP_LIMIT = 40000;
export const BLOCK_KINDS = ['header', 'info', 'group', 'item'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export type BlockStyle = { color?: string; background?: string; borderColor?: string; borderWidth?: number; radius?: number; padding?: number };
export type Appearance = { blocks?: Partial<Record<BlockKind, BlockStyle>>; overrides?: Record<string, BlockStyle> };

const HEX = /^#[\da-f]{6}$/i;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const hex = (value: unknown) => (typeof value === 'string' && HEX.test(value) ? value.toUpperCase() : undefined);
const oneOf = (value: unknown, allowed: readonly number[]) => (typeof value === 'number' && allowed.includes(value) ? value : undefined);

/** Keeps only #RRGGBB colours, a 0-4 px border and radius/padding from the fixed sets; everything else is dropped. */
export function sanitizeBlockStyle(value: unknown): BlockStyle {
  if (!isRecord(value)) return {};
  const result: BlockStyle = {};
  const color = hex(value.color), background = hex(value.background), borderColor = hex(value.borderColor);
  if (color) result.color = color;
  if (background) result.background = background;
  if (borderColor) result.borderColor = borderColor;
  if (typeof value.borderWidth === 'number' && Number.isInteger(value.borderWidth) && value.borderWidth >= 0 && value.borderWidth <= APPEARANCE_BORDER_MAX) result.borderWidth = value.borderWidth;
  const radius = oneOf(value.radius, APPEARANCE_RADII), padding = oneOf(value.padding, APPEARANCE_PADDINGS);
  if (radius !== undefined) result.radius = radius;
  if (padding !== undefined) result.padding = padding;
  return result;
}

export const isEmptyBlockStyle = (style: BlockStyle | undefined) => !style || Object.keys(style).length === 0;

/** Returns null when nothing styled is left, so "no appearance" is a single state. */
export function sanitizeAppearance(value: unknown): Appearance | null {
  if (!isRecord(value)) return null;
  const blocks: Partial<Record<BlockKind, BlockStyle>> = {};
  if (isRecord(value.blocks)) {
    for (const kind of BLOCK_KINDS) {
      const style = sanitizeBlockStyle(value.blocks[kind]);
      if (!isEmptyBlockStyle(style)) blocks[kind] = style;
    }
  }
  const overrides: Record<string, BlockStyle> = {};
  if (isRecord(value.overrides)) {
    for (const [id, raw] of Object.entries(value.overrides).slice(0, APPEARANCE_OVERRIDES_MAX)) {
      if (!UUID.test(id)) continue;
      const style = sanitizeBlockStyle(raw);
      if (!isEmptyBlockStyle(style)) overrides[id.toLowerCase()] = style;
    }
  }
  const result: Appearance = {};
  if (Object.keys(blocks).length) result.blocks = blocks;
  if (Object.keys(overrides).length) result.overrides = overrides;
  return Object.keys(result).length ? result : null;
}

/** Drops overrides of groups and criteria that no longer exist. */
export function pruneAppearance(appearance: Appearance | null | undefined, liveIds: ReadonlySet<string>): Appearance | null {
  if (!appearance) return null;
  return sanitizeAppearance({ blocks: appearance.blocks, overrides: Object.fromEntries(Object.entries(appearance.overrides ?? {}).filter(([id]) => liveIds.has(id))) });
}

/** The override of one block wins over the style of its kind, property by property. */
export function resolveBlockStyle(appearance: Appearance | null | undefined, kind: BlockKind, ...overrideIds: Array<string | null | undefined>): BlockStyle {
  let style: BlockStyle = { ...appearance?.blocks?.[kind] };
  for (const id of overrideIds) if (id && appearance?.overrides?.[id]) style = { ...style, ...appearance.overrides[id] };
  return style;
}

/** Inline CSS for a block; never touches outline, so keyboard focus and required marks stay visible. */
export function blockCss(style: BlockStyle): Record<string, string | number> {
  const css: Record<string, string | number> = {};
  if (style.color) css.color = style.color;
  if (style.background) css.backgroundColor = style.background;
  const width = style.borderWidth ?? (style.borderColor ? 1 : undefined);
  if (width !== undefined) { css.borderStyle = width > 0 ? 'solid' : 'none'; css.borderWidth = width; if (style.borderColor) css.borderColor = style.borderColor; }
  if (style.radius !== undefined) css.borderRadius = style.radius;
  if (style.padding !== undefined) css.padding = style.padding;
  return css;
}

const luminance = (color: string) => {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
/** WCAG contrast ratio of two #RRGGBB colours; 0 when either is not a colour. */
export function appearanceContrast(foreground: string, background: string) {
  if (!HEX.test(foreground) || !HEX.test(background)) return 0;
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high! + 0.05) / (low! + 0.05);
}
/** The page text is #172033 on white unless the author sets a colour. */
export function appearanceLowContrast(style: BlockStyle) {
  if (!style.color && !style.background) return false;
  return appearanceContrast(style.color ?? '#172033', style.background ?? '#FFFFFF') < 4.5;
}

export const APPEARANCE_PRESETS: Record<'strict' | 'calm' | 'contrast', { blocks: Record<BlockKind, BlockStyle> }> = {
  strict: { blocks: {
    header: { color: '#172033', background: '#FFFFFF', borderColor: '#172033', borderWidth: 2, radius: 0, padding: 16 },
    info: { color: '#172033', background: '#FFFFFF', borderColor: '#172033', borderWidth: 1, radius: 0, padding: 16 },
    group: { color: '#172033', background: '#F3F4F6', borderColor: '#172033', borderWidth: 1, radius: 0, padding: 12 },
    item: { color: '#172033', background: '#FFFFFF', borderColor: '#172033', borderWidth: 1, radius: 0, padding: 16 },
  } },
  calm: { blocks: {
    header: { color: '#172033', background: '#EAF2FB', borderColor: '#BFD5EC', borderWidth: 1, radius: 20, padding: 24 },
    info: { color: '#172033', background: '#F1F7EE', borderColor: '#C9DEC0', borderWidth: 1, radius: 12, padding: 16 },
    group: { color: '#172033', background: '#F4F1FA', borderColor: '#D5CCE8', borderWidth: 1, radius: 12, padding: 12 },
    item: { color: '#172033', background: '#FFFFFF', borderColor: '#D9DEE7', borderWidth: 1, radius: 12, padding: 16 },
  } },
  contrast: { blocks: {
    header: { color: '#FFFFFF', background: '#172033', borderColor: '#172033', borderWidth: 0, radius: 12, padding: 24 },
    info: { color: '#172033', background: '#FFF7CC', borderColor: '#172033', borderWidth: 3, radius: 6, padding: 16 },
    group: { color: '#FFFFFF', background: '#1D4ED8', borderColor: '#1D4ED8', borderWidth: 0, radius: 6, padding: 12 },
    item: { color: '#172033', background: '#FFFFFF', borderColor: '#172033', borderWidth: 3, radius: 6, padding: 16 },
  } },
};
