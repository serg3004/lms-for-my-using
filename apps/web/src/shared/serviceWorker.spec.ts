// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import headers from '../../../../infra/nginx/security-headers.conf?raw';
import nginx from '../../../../infra/nginx/nginx.conf?raw';
import offlinePage from '../../public/offline.html?raw';
import manifestText from '../../public/manifest.webmanifest?raw';
import source from '../../public/sw.js?raw';

// PR 357: the service worker may cache only a notice page and an icon; no API answer, photo, script or application page
// can ever reach its cache. The file in `public/` is run here against a fake worker scope.
const publicFiles = Object.keys(import.meta.glob('../../public/*', { eager: false })).map((path) => path.replace('../../public/', ''));

type Handler = (event: Record<string, unknown>) => void;
function load(fetchImpl: (request: unknown) => Promise<unknown> = () => Promise.reject(new Error('offline'))) {
  const handlers = new Map<string, Handler>();
  const stored = new Map<string, string[]>();
  const cache = { addAll: vi.fn(async (paths: string[]) => { stored.set('lms-shell-v1', paths); }) };
  const caches = {
    open: vi.fn(async (name: string) => { stored.set(name, stored.get(name) ?? []); return cache; }),
    keys: vi.fn(async () => ['lms-shell-v0', 'lms-shell-v1', 'other-app']),
    delete: vi.fn(async () => true),
    match: vi.fn(async (path: string) => (stored.get('lms-shell-v1')?.includes(path) ? { cached: path } : undefined)),
  };
  const self = { location: { origin: 'https://lms.example.test' }, addEventListener: (type: string, handler: Handler) => handlers.set(type, handler) };
  new Function('self', 'caches', 'fetch', 'Response', source)(self, caches, fetchImpl, { error: () => ({ error: true }) });
  return { handlers, caches, stored };
}
const request = (url: string, mode = 'navigate', method = 'GET') => ({ url, mode, method });
async function respond(handlers: Map<string, Handler>, req: unknown) {
  let answer: Promise<unknown> | undefined;
  handlers.get('fetch')?.({ request: req, respondWith: (value: Promise<unknown>) => { answer = value; } });
  return answer;
}

describe('service worker', () => {
  it('caches only the notice page and an icon when installed', async () => {
    const { handlers, stored } = load();
    let done: Promise<unknown> | undefined;
    handlers.get('install')?.({ waitUntil: (value: Promise<unknown>) => { done = value; } });
    await done;
    expect(stored.get('lms-shell-v1')).toEqual(['/offline.html', '/icon-192.png']);
  });

  it('removes only its own older caches when it takes over', async () => {
    const { handlers, caches } = load();
    let done: Promise<unknown> | undefined;
    handlers.get('activate')?.({ waitUntil: (value: Promise<unknown>) => { done = value; } });
    await done;
    expect(caches.delete).toHaveBeenCalledTimes(1);
    expect(caches.delete).toHaveBeenCalledWith('lms-shell-v0');
  });

  it('never answers an API call, an asset, another site, or a request that is not a page load', async () => {
    const { handlers } = load();
    for (const req of [
      request('https://lms.example.test/api/v1/auth/me', 'cors'),
      request('https://lms.example.test/assets/index.js', 'no-cors'),
      request('https://lms.example.test/api/v1/users', 'navigate', 'POST'),
      request('https://elsewhere.example.test/', 'navigate'),
    ]) expect(await respond(handlers, req)).toBeUndefined();
  });

  it('shows the notice page when a page load fails, and the live answer otherwise', async () => {
    const offline = load();
    // Before the notice page is cached the browser's own error page shows (a network error), never stale content.
    expect(await respond(offline.handlers, request('https://lms.example.test/mentor'))).toEqual({ error: true });
    let cached: Promise<unknown> | undefined;
    offline.handlers.get('install')?.({ waitUntil: (value: Promise<unknown>) => { cached = value; } });
    await cached;
    expect(await respond(offline.handlers, request('https://lms.example.test/mentor'))).toEqual({ cached: '/offline.html' });

    const live = load(async () => ({ live: true }));
    expect(await respond(live.handlers, request('https://lms.example.test/mentor'))).toEqual({ live: true });
  });

  it('does not take over open pages by itself, so a session being filled in is not reloaded', () => {
    expect(source.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/skipWaiting|clients\.claim/);
  });
});

describe('manifest and files for installing', () => {
  const manifest = JSON.parse(manifestText) as {
    name: string; start_url: string; scope: string; display: string; theme_color: string; icons: Array<{ src: string; sizes: string; purpose: string }>;
  };

  it('describes an installable standalone app', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable')).toHaveLength(1);
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });

  it('points only to files that exist', () => {
    for (const icon of manifest.icons) expect(publicFiles).toContain(icon.src.replace(/^\//, ''));
    expect(publicFiles).toEqual(expect.arrayContaining(['offline.html', 'apple-touch-icon.png', 'icon-192.png', 'sw.js']));
  });

  it('has a notice page in all four languages with no script (the policy forbids inline scripts)', () => {
    const page = offlinePage;
    for (const lang of ['ru', 'en', 'kk', 'zh']) expect(page).toContain(`lang="${lang}"`);
    expect(page).not.toMatch(/<script/i);
  });

  it('is served by nginx without a long cache for the worker and the manifest, and keeps the policy', () => {
    for (const location of ['/sw.js', '/manifest.webmanifest']) {
      const block = new RegExp(`location = ${location.replace('.', '\\.')} \\{[^}]*Cache-Control "no-cache"[^}]*security-headers\\.conf`);
      expect(nginx).toMatch(block);
    }
    expect(headers).toContain("script-src 'self';");
    expect(headers).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(headers).toContain('camera=(self)');
    expect(headers).toContain('microphone=()');
  });
});
