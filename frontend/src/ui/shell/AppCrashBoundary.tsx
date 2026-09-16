import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import Button from "../primitives/Button";
import { describeThrown, recordCrash } from "../../diagnostics/crashLog";

/**
 * The last thing standing.
 *
 * `RouteErrorBoundary` wraps `{children}` *inside* `AppShell`, which means a
 * throw in the shell itself, in a provider or in the router is above it and
 * nothing catches it: React unmounts the whole tree and the app blanks to the
 * themed page background with an empty body -- exactly what Roli filmed on his
 * phone (measured RGB 13,18,27 against the blue theme's own `--color-bg-default`
 * of 11,17,30: the bundle had loaded and `data-theme` had been applied). So this
 * boundary sits outside every provider, in `main.tsx`.
 *
 * The two boundaries have different jobs and different reset keys: the route one
 * clears itself when you navigate away, because the *page* failed and the rest
 * of the app is fine. This one does not reset at all -- there is no router left
 * to tell it anything -- so its way out is a real browser navigation.
 *
 * It must not itself throw, which rules out context, queries and router hooks.
 * What it renders is plain elements, the theme tokens the document already
 * carries, `Button` (a styled `<button>`, no context) and one lucide icon.
 */
type State = { error: unknown };

export default class AppCrashBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error("Unknown error") };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    try {
      recordCrash({ source: "app-boundary", value: error, componentStack: info?.componentStack });
    } catch {
      // the recorder is never the reason something breaks
    }
  }

  render() {
    if (this.state.error == null) return this.props.children;

    const described = describeThrown(this.state.error);

    return (
      <div
        className="min-h-screen bg-bg-default px-4 pb-10 text-text-normal"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 2.5rem)" }}
      >
        <div className="mx-auto max-w-md">
          <section className="card space-y-3">
            <div className="flex items-start gap-2">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-text-normal">The app crashed</h1>
                <p className="mt-1 text-sm text-text-muted">
                  Something broke above the page, so the whole screen went blank. Nothing you did is lost.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-error/40 bg-error/10 p-3 text-xs text-error">
              {described.message}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="md" className="flex-1 justify-center" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="flex-1 justify-center"
                onClick={() => window.location.assign("/dashboard")}
              >
                Go to dashboard
              </Button>
            </div>

            <p className="text-xs text-text-muted">
              The details below are saved on this device.{" "}
              <a className="underline" href="/settings?tab=diagnostics">
                Settings &rarr; Diagnostics
              </a>{" "}
              lists them and copies them as text.
            </p>

            {described.stack ? (
              <details open>
                <summary className="cursor-pointer text-xs font-semibold text-text-normal">Stack</summary>
                <pre
                  data-no-swipe-nav
                  className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-bg-card-chip/50 p-3 font-mono text-xs text-text-muted"
                >
                  {described.stack}
                </pre>
              </details>
            ) : null}
          </section>
        </div>
      </div>
    );
  }
}
