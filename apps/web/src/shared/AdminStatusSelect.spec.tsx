import type { ChangeEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AdminStatusSelect } from './AdminStatusSelect';

describe('AdminStatusSelect', () => {
  const statuses = ['draft', 'published', 'archived'] as const;

  it('renders current value and all status options', () => {
    const html = renderToStaticMarkup(<AdminStatusSelect value="published" statuses={statuses} onChange={vi.fn()} />);

    expect(html).toContain('admin-status-select');
    expect(html).toContain('value="published"');
    expect(html).toContain('draft');
    expect(html).toContain('published');
    expect(html).toContain('archived');
  });

  it('allows overriding className for non-table usage', () => {
    const html = renderToStaticMarkup(
      <AdminStatusSelect value="draft" statuses={statuses} onChange={vi.fn()} className="admin-form-status-select" />,
    );

    expect(html).toContain('admin-form-status-select');
  });

  it('forwards the selected value to onChange', () => {
    const onChange = vi.fn();
    const select = AdminStatusSelect({ value: 'draft', statuses, onChange });

    select.props.onChange({ target: { value: 'archived' } } as unknown as ChangeEvent<HTMLSelectElement>);

    expect(onChange).toHaveBeenCalledWith('archived');
  });
});
