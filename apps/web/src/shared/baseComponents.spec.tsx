// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button, EmptyState, Input, MoreMenu, Tabs } from './ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;
afterEach(() => { container?.remove(); container = undefined; });

async function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(node); });
  return container;
}

const tabs = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', disabled: true }, { key: 'c', label: 'C' }];
function Harness({ onChange }: { onChange?: (key: string) => void }) {
  const [value, setValue] = useState('a');
  return <Tabs label="Sections" tabs={tabs} value={value} onChange={(key) => { setValue(key); onChange?.(key); }} />;
}
const key = (root: HTMLElement, name: string) => act(async () => { root.querySelector('[role="tablist"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })); });

describe('base components: states', () => {
  it('Button: every variant renders, a disabled button does not fire, the text variant exists', async () => {
    const onClick = vi.fn();
    const root = await render(<>{(['primary', 'secondary', 'text', 'ghost', 'danger'] as const).map((variant) => <Button disabled={variant === 'danger'} key={variant} onClick={onClick} variant={variant}>{variant}</Button>)}</>);
    const buttons = Array.from(root.querySelectorAll('button'));
    expect(buttons.map((button) => button.className)).toEqual(expect.arrayContaining([expect.stringContaining('ds-button--text')]));
    await act(async () => { buttons.forEach((button) => button.click()); });
    expect(onClick).toHaveBeenCalledTimes(4);
  });

  it('Input: error and disabled states are exposed to assistive technology', async () => {
    const root = await render(<><Input disabled label="Name" /><Input error="Required" label="Email" /></>);
    const [name, email] = Array.from(root.querySelectorAll('input'));
    expect(name!.disabled).toBe(true);
    expect(email!.getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('[role="alert"], .ds-field__error')?.textContent).toBe('Required');
  });

  it('EmptyState: short explanation with one action, announced as a status', async () => {
    const root = await render(<EmptyState action={<Button>Add</Button>} message="Nothing yet" title="No items" />);
    expect(root.querySelector('[role="status"]')).not.toBeNull();
    expect(root.querySelectorAll('button')).toHaveLength(1);
    expect(root.textContent).toContain('Nothing yet');
  });

  it('MoreMenu: the icon trigger has an accessible name and opens the menu', async () => {
    const root = await render(<MoreMenu label="More actions"><button role="menuitem" type="button">Archive</button></MoreMenu>);
    const trigger = root.querySelector('button')!;
    expect(trigger.getAttribute('aria-label')).toBe('More actions');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { trigger.click(); });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[role="menu"]')?.textContent).toBe('Archive');
  });

  it('Tabs: one tab is in the tab order, arrows skip the disabled tab and wrap, Home and End jump', async () => {
    const onChange = vi.fn();
    const root = await render(<Harness onChange={onChange} />);
    const selected = () => root.querySelector('[role="tab"][aria-selected="true"]')!.textContent;
    expect(root.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe('Sections');
    expect(Array.from(root.querySelectorAll('[role="tab"]')).filter((tab) => tab.getAttribute('tabindex') === '0')).toHaveLength(1);
    await key(root, 'ArrowRight');
    expect(selected()).toBe('C');
    await key(root, 'ArrowRight');
    expect(selected()).toBe('A');
    await key(root, 'End');
    expect(selected()).toBe('C');
    await key(root, 'Home');
    expect(selected()).toBe('A');
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});
