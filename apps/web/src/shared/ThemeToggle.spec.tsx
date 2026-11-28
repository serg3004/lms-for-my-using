// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from './ThemeToggle';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, options?: Record<string, string>) => {
      const texts: Record<string, string> = {
        'theme.light': 'Light', 'theme.dark': 'Dark', 'theme.system': 'Same as device', 'theme.menuLabel': 'Theme',
        'theme.switchLabel': `Theme: ${options?.mode}`, 'theme.appliedNow': `now ${options?.theme}`,
      };
      return texts[key] ?? key;
    },
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;

function stubStorage(initial?: string) {
  let value = initial ?? null;
  vi.stubGlobal('localStorage', {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
    removeItem: () => { value = null; },
  });
}

function stubDevice(dark: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: dark, addEventListener: () => undefined, removeEventListener: () => undefined }));
}

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container!).render(<ThemeToggle />); });
}

const button = () => container!.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
const items = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));

afterEach(() => {
  container?.remove();
  container = undefined;
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
});

describe('theme menu (PR 577)', () => {
  it('opens a labelled list of themes with the chosen one checked', async () => {
    stubStorage('dark');
    stubDevice(false);
    await render();
    expect(button().getAttribute('aria-label')).toBe('Theme: Dark');
    await act(async () => { button().click(); });
    expect(items().map((item) => item.textContent?.replace('✓', '').trim())).toEqual(['Light', 'Dark', 'Same as devicenow light']);
    expect(items().map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });

  it('says which theme the device gives when "same as device" is chosen', async () => {
    stubStorage();
    stubDevice(true);
    await render();
    await act(async () => { button().click(); });
    expect(items()[2]!.getAttribute('aria-checked')).toBe('true');
    expect(items()[2]!.textContent).toContain('now dark');
  });

  it('applies and remembers a choice, then closes the menu', async () => {
    stubStorage();
    stubDevice(false);
    await render();
    await act(async () => { button().click(); });
    await act(async () => { items()[1]!.click(); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('lms.themeMode')).toBe('dark');
    expect(items()).toHaveLength(0);
    expect(button().getAttribute('aria-label')).toBe('Theme: Dark');
  });
});
