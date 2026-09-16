import { Component, type ErrorInfo, type ReactNode } from "react";

import Button from "../primitives/Button";
import { recordCrash } from "../../diagnostics/crashLog";

/**
 * Catches render errors in the routed page so a crash shows a recoverable
 * message instead of a white screen. Resets automatically when `resetKey`
 * (the route path) changes, so navigating away clears a stuck error.
 *
 * This is the *page* boundary. A throw in the shell, in a provider or in the
 * router happens above it and is caught by `AppCrashBoundary` in `main.tsx`
 * instead -- two boundaries, two jobs, two reset keys. Both write what they
 * caught to the crash log, which Settings -> Diagnostics reads back.
 */
export default class RouteErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      recordCrash({ source: "route-boundary", value: error, componentStack: info?.componentStack });
    } catch {
      // the recorder is never the reason something breaks
    }
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
            <p className="mt-1 text-xs text-text-muted">Saved to Settings &rarr; Diagnostics.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button type="button" variant="ghost" onClick={() => window.history.back()}>Go back</Button>
              <Button type="button" onClick={() => window.location.reload()}>Reload</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
