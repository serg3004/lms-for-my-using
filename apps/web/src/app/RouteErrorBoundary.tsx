import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Route rendering failed', error, errorInfo);
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
