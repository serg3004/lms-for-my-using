// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AdminPageHeader, AdminPageLayout } from './adminPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;
beforeEach(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
  try { localStorage.removeItem('lms.navCollapsed'); } catch { /* storage may be blocked */ }
});
afterEach(() => { container?.remove(); container = undefined; });

async function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(node); });
  return container;
}

const nav = [{ label: 'Users', href: '/admin/users', isCurrent: true }];

describe('page frame (PR 568)', () => {
  it('sidebar: collapses to icons, keeps labels for screen readers, adds tooltips and remembers the choice', async () => {
    const root = await render(<AdminPageLayout brandLabel="Admin" currentPath="/admin/users" navItems={nav} sidebarLabel="Admin navigation"><p>content</p></AdminPageLayout>);
    const layout = root.querySelector('.admin-layout')!;
    const toggle = root.querySelector<HTMLButtonElement>('.nav-collapse')!;
    expect(layout.getAttribute('data-nav')).toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await act(async () => { toggle.click(); });
    expect(layout.getAttribute('data-nav')).toBe('collapsed');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    const link = root.querySelector<HTMLAnchorElement>('.admin-nav-link')!;
    expect(link.getAttribute('title')).toBe(link.textContent);
    expect(link.querySelector('span')!.textContent).not.toBe('');
    expect(localStorage.getItem('lms.navCollapsed')).toBe('1');
  });

  it('page header: one primary button and rare actions behind a named «⋯» menu', async () => {
    const root = await render(<AdminPageHeader more={{ label: 'More actions', children: <button role="menuitem" type="button">Export</button> }} primary={<button type="button">Create</button>} title="Users" />);
    const buttons = Array.from(root.querySelectorAll('button'));
    expect(buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Create', 'More actions']);
    await act(async () => { buttons[1]!.click(); });
    expect(root.querySelector('[role="menu"]')?.textContent).toBe('Export');
  });

  it('page header: without primary and more nothing extra is rendered', async () => {
    const root = await render(<AdminPageHeader title="Users" />);
    expect(root.querySelector('.admin-header-actions')).toBeNull();
  });
});
