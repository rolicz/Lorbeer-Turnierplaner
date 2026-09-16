/**
 * Wires the diagnostics together, once, from `main.tsx` -- before React renders,
 * so a throw during the very first render is already covered.
 *
 * Order matters: the previous session's liveness marker is read (and cleared)
 * *before* this session starts writing its own, otherwise the new heartbeat
 * would overwrite the evidence it is supposed to report.
 *
 * This is also where the blank-screen detector is joined to the recorder. It is
 * a callback rather than an import so `lifecycle` never has to depend on
 * `crashLog` (which already depends on it), and so the one policy question --
 * *what happens the moment the app stops drawing* -- is answered in one place.
 */
import { paintBlankNotice } from "./blankNotice";
import { flushCrashLog, recordBlankScreen, recordCrash, recordUnexpectedEnd } from "./crashLog";
import { setBlankScreenHandler, startLifecycleMonitor, takePreviousMarker, unexpectedEnd } from "./lifecycle";
import type { Crumb } from "./breadcrumbs";

let installed = false;

/**
 * The app has stopped drawing and the page is still here. Write it down, get it
 * to storage now (this document may not get another chance), and then say so on
 * the screen that is otherwise empty. Each step is on its own so a failure in
 * one cannot cost the others.
 */
export function reportBlankScreen(end: { ts: number; url: string; trail: Crumb[] }): void {
  try {
    recordBlankScreen(end);
  } catch {
    // ignore
  }
  try {
    flushCrashLog();
  } catch {
    // ignore
  }
  try {
    paintBlankNotice();
  } catch {
    // ignore
  }
}

function installGlobalHandlers(): void {
  window.addEventListener("error", (event: Event) => {
    try {
      // Resource-load failures (a 404 image) dispatch a plain Event at the
      // element and do not bubble here; only real script errors are ErrorEvents.
      if (!(event instanceof ErrorEvent)) return;
      recordCrash({ source: "window-error", value: event.error ?? event.message });
    } catch {
      // ignore
    }
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    try {
      recordCrash({ source: "unhandled-rejection", value: event.reason });
    } catch {
      // ignore
    }
  });

  // A loop throttles storage writes; if the app goes away mid-throttle, write now.
  window.addEventListener("pagehide", flushCrashLog);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushCrashLog();
  });
}

/** Start recording. Safe to call more than once. */
export function initDiagnostics(): void {
  if (installed) return;
  installed = true;

  try {
    const end = unexpectedEnd(takePreviousMarker());
    if (end?.kind === "blank") recordBlankScreen(end);
    else if (end) recordUnexpectedEnd(end);
  } catch {
    // ignore
  }

  try {
    installGlobalHandlers();
  } catch {
    // ignore
  }

  try {
    setBlankScreenHandler(reportBlankScreen);
  } catch {
    // ignore
  }

  try {
    startLifecycleMonitor();
  } catch {
    // ignore
  }
}
