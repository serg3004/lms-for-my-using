import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RouteErrorBoundary } from './RouteErrorBoundary.js';

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
