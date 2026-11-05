import type { CSSProperties, ReactNode } from 'react';
import { blockCss, isEmptyBlockStyle, resolveBlockStyle, type Appearance, type BlockKind, type BlockStyle } from '@lms/shared/checklist-appearance';

export const appearanceCss = (style: BlockStyle): CSSProperties => blockCss(style) as CSSProperties;

/** PR 422: the author's look of one sheet block. Without a style it renders its children untouched, so a sheet without appearance looks as before. */
export function AppearanceBlock({ appearance, kind, id, children, style }: { appearance: Appearance | null | undefined; kind: BlockKind; id?: string | null; children: ReactNode; style?: CSSProperties }) {
  const resolved = resolveBlockStyle(appearance, kind, id);
  if (isEmptyBlockStyle(resolved)) return <>{children}</>;
  return <div style={{ ...style, ...appearanceCss(resolved) }}>{children}</div>;
}

/** A criterion card keeps its own style and lets the author's style win; the "done" cue survives as an inset bar. */
export function itemCardStyle(appearance: Appearance | null | undefined, id: string, base: CSSProperties, doneColor: string, done: boolean): CSSProperties {
  const resolved = resolveBlockStyle(appearance, 'item', id);
  if (isEmptyBlockStyle(resolved)) return base;
  return { ...base, ...appearanceCss(resolved), ...(done ? { boxShadow: `inset 6px 0 0 ${doneColor}` } : {}) };
}
