import type { HTMLAttributes } from 'react';
import { descriptionAlign, descriptionExplicitAlign, descriptionRuns, type DescriptionAlign } from '@lms/shared/checklist-description';
export { plainText } from '@lms/shared/rich-text';

/** `defaultAlign` (PR 455, image captions): what a text without a chosen alignment gets; an explicit "left" is then kept as left. */
export function RichText({ value, as: Tag = 'span', style, defaultAlign, ...props }: { value: string; as?: 'span' | 'p' | 'h1' | 'h2' | 'h3'; defaultAlign?: DescriptionAlign } & HTMLAttributes<HTMLElement>) {
  // Alignment belongs to the whole field; an inline span becomes a block only when the author chose a non-default alignment.
  const align: DescriptionAlign = defaultAlign ? descriptionExplicitAlign(value) ?? defaultAlign : descriptionAlign(value);
  return <Tag {...props} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...(align === 'left' && !defaultAlign ? {} : { textAlign: align, ...(Tag === 'span' ? { display: 'block' } : {}) }), ...style }}>{descriptionRuns(value).map((run, index) => <span key={index} style={{ fontWeight: run.bold ? 700 : undefined, fontStyle: run.italic ? 'italic' : undefined, textDecoration: run.underline ? 'underline' : undefined, textTransform: run.uppercase ? 'uppercase' : undefined, fontSize: run.size, color: run.color }}>{run.text}</span>)}</Tag>;
}
