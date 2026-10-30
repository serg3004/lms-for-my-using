// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChecklistCheckboxOption, ChecklistHelpTip } from './ChecklistHelpTip.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string, vars?: { name?: string }) => fallback.replace('{{name}}', vars?.name ?? '') }) }));

function mount(node: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

describe('ChecklistHelpTip', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('opens on tap, closes on Escape and on an outside tap, and links the hint to the button', () => {
    const { host } = mount(<div><ChecklistHelpTip name="Skip">Hint text</ChecklistHelpTip><p id="outside">outside</p></div>);
    const button = host.querySelector('button') as HTMLButtonElement;
    const tip = host.querySelector('[role="tooltip"]') as HTMLElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-describedby')).toBe(tip.id);
    expect(button.getAttribute('aria-label')).toBe('Hint: Skip');
    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    act(() => button.click());
    act(() => { (host.querySelector('#outside') as HTMLElement).dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the checkbox toggle separate from the hint button', () => {
    const onChange = vi.fn();
    const { host } = mount(<ChecklistCheckboxOption label="Skip" hint="Hint" checked={false} onChange={onChange} />);
    act(() => (host.querySelector('input') as HTMLInputElement).click());
    expect(onChange).toHaveBeenCalledWith(true);
    act(() => (host.querySelector('button') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
