import type { HTMLAttributes } from 'react';
import { descriptionAlign, descriptionRuns } from '@lms/shared/checklist-description';
export { plainText } from '@lms/shared/rich-text';

export function RichText({ value, as: Tag = 'span', style, ...props }: { value: string; as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' } & HTMLAttributes<HTMLElement>) {
  // Alignment belongs to the whole field; an inline span becomes a block only when the author chose a non-default alignment.
  const align = descriptionAlign(value);
  return <Tag {...props} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...(align === 'left' ? {} : { textAlign: align, ...(Tag === 'span' ? { display: 'block' } : {}) }), ...style }}>{descriptionRuns(value).map((run, index) => <span key={index} style={{ fontWeight: run.bold ? 700 : undefined, fontStyle: run.italic ? 'italic' : undefined, textDecoration: run.underline ? 'underline' : undefined, textTransform: run.uppercase ? 'uppercase' : undefined, fontSize: run.size, color: run.color }}>{run.text}</span>)}</Tag>;
}
