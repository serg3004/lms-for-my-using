import type { ReactNode } from 'react';
import { safeHref, type EditorBlock, type Run } from './model.js';

export function TextPreview({ block }: { block: EditorBlock }) {
  const runs = (Array.isArray(block.content.runs) ? block.content.runs : []) as Run[];
  return <div className="lr-preview" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: block.type === 'heading' ? `${1.75 - Number(block.content.level) * 0.2}rem` : undefined, fontWeight: block.type === 'heading' ? 700 : undefined }}>{runs.map((run, index) => {
    let text = <span>{run.text}</span>;
    if (run.bold) text = <strong>{text}</strong>;
    if (run.italic) text = <em>{text}</em>;
    if (run.underline) text = <u>{text}</u>;
    if (run.code) text = <code>{text}</code>;
    if (run.href && safeHref(run.href)) text = <a href={run.href} onClick={(event) => event.preventDefault()}>{text}</a>;
    return <span key={index}>{text}</span>;
  })}</div>;
}

export function ListPreview({ block }: { block: EditorBlock }) {
  const items = block.content.items as { level: number; runs: Run[] }[];
  let position = 0;
  function list(level: number): ReactNode {
    const children: ReactNode[] = [];
    while (position < items.length && items[position]!.level === level) {
      const index = position++, item = items[index]!;
      const nested = position < items.length && items[position]!.level > level ? list(level + 1) : null;
      children.push(<li key={index}><TextPreview block={{ ...block, content: { runs: item.runs } }} />{nested}</li>);
    }
    return block.content.ordered ? <ol>{children}</ol> : <ul>{children}</ul>;
  }
  return list(1);
}
