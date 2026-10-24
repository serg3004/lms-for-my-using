// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './ui.js';

describe('DataTable responsive expansion', () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('removes a responsive-only expanded row after leaving the mobile breakpoint', () => {
    let onBreakpointChange: ((event: MediaQueryListEvent) => void) | undefined;
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      media: '(max-width: 860px)',
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        onBreakpointChange = listener as (event: MediaQueryListEvent) => void;
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(
      <DataTable
        columns={[
          { key: 'name', label: 'Name', priority: 'primary', render: (row: { id: string; name: string }) => row.name },
          { key: 'details', label: 'Details', priority: 'secondary', render: () => 'Hidden detail' },
        ]}
        keyExtractor={(row) => row.id}
        label="Items"
        responsiveDetails={{
          label: 'Details',
          expandLabel: (row) => `Expand ${row.name}`,
          collapseLabel: (row) => `Collapse ${row.name}`,
        }}
        rows={[{ id: '1', name: 'Alice' }]}
      />,
    ));

    act(() => container.querySelector<HTMLButtonElement>('.ds-data-table__expand')?.click());
    expect(container.querySelector('.ds-data-table__expanded')).not.toBeNull();

    act(() => onBreakpointChange?.({ matches: false } as MediaQueryListEvent));
    expect(container.querySelector('.ds-data-table__expanded')).toBeNull();
  });

  it('runs onRowClick for clicks on the row but not for clicks on links or buttons inside it (PR 325)', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const onRowClick = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(
      <DataTable
        columns={[
          { key: 'name', label: 'Name', priority: 'primary', render: (row: { id: string; name: string }) => <a href="#open">{row.name}</a> },
          { key: 'action', label: 'Action', priority: 'primary', render: () => <button type="button">Cancel</button> },
        ]}
        keyExtractor={(row) => row.id}
        label="Items"
        onRowClick={onRowClick}
        responsiveDetails={{ label: 'Details', expandLabel: () => 'Expand', collapseLabel: () => 'Collapse' }}
        rows={[{ id: '1', name: 'Alice' }]}
      />,
    ));

    act(() => container.querySelector<HTMLAnchorElement>('tbody a')?.click());
    act(() => container.querySelector<HTMLButtonElement>('tbody button:not(.ds-data-table__expand)')?.click());
    expect(onRowClick).not.toHaveBeenCalled();

    act(() => container.querySelector<HTMLTableCellElement>('tbody td:last-child')?.click());
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', name: 'Alice' });
  });
});
