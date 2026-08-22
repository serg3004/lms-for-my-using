import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => ({
  ...await vi.importActual<typeof import('react')>('react'),
  useId: () => 'material',
}));

import { MaterialMetadataForm } from './MaterialMetadataForm.js';
import { MaterialTable, type MaterialRow } from './MaterialTable.js';

const t = ((_: string, fallback?: string) => fallback ?? '') as never;

describe('material form controls', () => {
  it('forwards title and kind changes', () => {
    const onChange = vi.fn();
    const form = MaterialMetadataForm({ form: { title: 'Guide', kind: 'link' }, onChange, t });
    const fields = (form.props as { children: Array<ReactElement<{ children: ReactElement }>> }).children;
    const titleInput = fields[0]!.props.children as ReactElement<{ onChange: (event: { target: { value: string } }) => void }>;
    const kindSelect = fields[1]!.props.children as ReactElement<{ onChange: (event: { target: { value: string } }) => void }>;

    titleInput.props.onChange({ target: { value: 'Updated guide' } });
    kindSelect.props.onChange({ target: { value: 'file' } });

    expect(onChange).toHaveBeenNthCalledWith(1, 'title', 'Updated guide');
    expect(onChange).toHaveBeenNthCalledWith(2, 'kind', 'file');
  });
});

describe('material table controls', () => {
  it('renders column values and forwards status and edit actions', () => {
    const onEdit = vi.fn();
    const onStatusChange = vi.fn();
    const material: MaterialRow = {
      id: 'material-1', title: 'Guide', kind: 'file', fileUrl: 'https://example.com/guide.pdf',
      sizeBytes: 1_048_576, status: 'active',
    };
    const table = MaterialTable({ materials: [material], onEdit, onStatusChange, t });
    const { columns, keyExtractor } = table.props as {
      columns: Array<{ render: (row: MaterialRow) => ReactElement | string }>;
      keyExtractor: (row: MaterialRow) => string;
    };

    expect(keyExtractor(material)).toBe('material-1');
    expect(columns[0]!.render(material)).toBeTruthy();
    expect(columns[1]!.render(material)).toBeTruthy();
    const statusSelect = columns[2]!.render(material) as ReactElement<{ onChange: (status: 'archived') => void }>;
    expect(columns[3]!.render(material)).toBe('1.0 MB');
    const editButton = columns[4]!.render(material) as ReactElement<{ onClick: () => void }>;
    statusSelect.props.onChange('archived');
    editButton.props.onClick();

    expect(onStatusChange).toHaveBeenCalledWith('material-1', 'archived');
    expect(onEdit).toHaveBeenCalledWith('material-1');
  });
});
