import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };

const staleChunkPattern = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|ChunkLoadError/i;
const reloadMarkerKey = 'route-chunk-reload-at';
const reloadWindowMs = 60_000;

/** After a deploy the old page asks for script files that no longer exist; that error is fixed by loading the new page. */
export function isStaleChunkError(error: unknown): boolean {
  return error instanceof Error && (staleChunkPattern.test(error.message) || staleChunkPattern.test(error.name));
}

/** Reloads the page once per minute at most, so a file that is really missing cannot cause a reload loop. Returns whether it reloaded. */
export function reloadOnceForStaleChunk(storage: Pick<Storage, 'getItem' | 'setItem'> | null, reload: () => void, now: number): boolean {
  try {
    const last = Number(storage?.getItem(reloadMarkerKey) ?? 0);
    if (last && now - last < reloadWindowMs) return false;
    storage?.setItem(reloadMarkerKey, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}
type State = { hasError: boolean };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Route rendering failed', error, errorInfo);
    if (isStaleChunkError(error)) {
      let storage: Storage | null;
      try {
        storage = window.sessionStorage;
      } catch {
        storage = null;
      }
      reloadOnceForStaleChunk(storage, () => window.location.reload(), Date.now());
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main id="main-content" tabIndex={-1}>
          <h1>Something went wrong</h1>
          <p role="alert">The page could not be loaded. Please refresh and try again.</p>
        </main>
      );
    }
    return this.props.children;
  }
}
