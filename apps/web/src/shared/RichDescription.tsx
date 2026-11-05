import { descriptionRuns } from '@lms/shared/checklist-description';

/** Text nodes and validated styles only, including for descriptions stored before server sanitization. */
export function RichDescription({ value }: { value: string }) {
  return <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{descriptionRuns(value).map((run, index) => <span key={index} style={{ fontWeight: run.bold ? 700 : undefined, fontStyle: run.italic ? 'italic' : undefined, textDecoration: run.underline ? 'underline' : undefined, textTransform: run.uppercase ? 'uppercase' : undefined, fontSize: run.size, color: run.color }}>{run.text}</span>)}</span>;
}
