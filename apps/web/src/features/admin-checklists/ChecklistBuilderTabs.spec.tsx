// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChecklistBuilderTabs, builderTabFromHash, type BuilderTab } from './ChecklistBuilderTabs.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const t = ((key: string, fallback?: string) => fallback ?? key) as never;

function Harness({ errorTab = null, initial = 'main' }: { errorTab?: BuilderTab | null; initial?: BuilderTab }) {
  const [tab, setTab] = useState<BuilderTab>(initial);
  return <ChecklistBuilderTabs active={tab} errorTab={errorTab} onChange={setTab} t={t}><button type="button">Save</button></ChecklistBuilderTabs>;
}

describe('ChecklistBuilderTabs (PR 435)', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const press = (el: HTMLElement, key: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });

  it('reads the tab from the address', () => {
    expect(builderTabFromHash('#settings')).toBe('settings');
    expect(builderTabFromHash('')).toBe('main');
    expect(builderTabFromHash('#other')).toBe('main');
  });

  it('moves between the tabs with arrows, Home and End, only the selected tab is in the tab order', () => {
    act(() => root.render(<Harness />));
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1]);
    press(tabs()[0]!, 'ArrowRight');
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    expect(document.activeElement).toBe(tabs()[1]);
    press(tabs()[1]!, 'ArrowRight');
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    press(tabs()[0]!, 'End');
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    press(tabs()[1]!, 'Home');
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('marks the tab with a failed field and keeps the Save button next to the tabs', () => {
    act(() => root.render(<Harness errorTab="settings" />));
    expect(tabs()[1]!.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('has an error');
    expect(tabs()[0]!.querySelector('[role="img"]')).toBeNull();
    expect(container.textContent).toContain('Save');
  });
});
