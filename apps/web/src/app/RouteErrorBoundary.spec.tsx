import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isStaleChunkError, reloadOnceForStaleChunk, RouteErrorBoundary } from './RouteErrorBoundary.js';

afterEach(() => vi.restoreAllMocks());

describe('RouteErrorBoundary', () => {
  it('renders its children before an error occurs', () => {
    const boundary = new RouteErrorBoundary({ children: <p>Route content</p> });

    expect(renderToStaticMarkup(boundary.render())).toContain('Route content');
  });

  it('derives the fallback state from a render error', () => {
    expect(RouteErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  });

  it('renders an accessible fallback after an error', () => {
    const boundary = new RouteErrorBoundary({ children: <p>Route content</p> });
    boundary.state = { hasError: true };

    const html = renderToStaticMarkup(boundary.render());

    expect(html).toContain('id="main-content"');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Route content');
  });

  it('reports the original error and component stack', () => {
    const error = new Error('Route failed');
    const errorInfo = { componentStack: '\n at BrokenRoute' };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boundary = new RouteErrorBoundary({ children: null });

    boundary.componentDidCatch(error, errorInfo);

    expect(consoleError).toHaveBeenCalledWith('Route rendering failed', error, errorInfo);
  });
});

describe('stale chunk recovery after a deploy', () => {
  it('recognises the errors browsers raise for a missing script file', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Page-abc.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new Error('Route failed'))).toBe(false);
    expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(false);
  });

  it('reloads once and refuses to reload again within a minute', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
    const reload = vi.fn();

    expect(reloadOnceForStaleChunk(storage, reload, 1_000_000)).toBe(true);
    expect(reloadOnceForStaleChunk(storage, reload, 1_030_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceForStaleChunk(storage, reload, 1_070_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when storage is unavailable or throws', () => {
    const reload = vi.fn();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => undefined };

    expect(reloadOnceForStaleChunk(broken, reload, 5_000_000)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads the page from the boundary only for a stale chunk error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('window', { sessionStorage: { getItem: () => null, setItem: () => undefined }, location: { reload } });
    const boundary = new RouteErrorBoundary({ children: null });

    boundary.componentDidCatch(new Error('Route failed'), { componentStack: '' });
    expect(reload).not.toHaveBeenCalled();
    boundary.componentDidCatch(new TypeError('Failed to fetch dynamically imported module: /a.js'), { componentStack: '' });
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
