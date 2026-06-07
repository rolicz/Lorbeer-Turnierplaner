import { Component, type ReactNode } from "react";

/**
 * Catches render errors in the routed page so a crash shows a recoverable
 * message instead of a white screen. Resets automatically when `resetKey`
 * (the route path) changes, so navigating away clears a stuck error.
 */
export default class RouteErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="mx-auto mt-12 max-w-sm text-center">
            <div className="text-base font-semibold text-text-normal">Something went wrong</div>
            <p className="mt-1 text-sm text-text-muted">This page hit an error. Go back or reload to continue.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" className="btn-ghost" onClick={() => window.history.back()}>Go back</button>
              <button type="button" className="btn-solid" onClick={() => window.location.reload()}>Reload</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
