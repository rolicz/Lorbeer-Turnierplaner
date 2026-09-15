/**
 * Wires the diagnostics together, once, from `main.tsx` -- before React renders,
 * so a throw during the very first render is already covered.
 *
 * Order matters: the previous session's liveness marker is read (and cleared)
 * *before* this session starts writing its own, otherwise the new heartbeat
 * would overwrite the evidence it is supposed to report.
 */
import { flushCrashLog, recordCrash, recordUnexpectedEnd } from "./crashLog";
import { startLifecycleMonitor, takePreviousMarker, unexpectedEnd } from "./lifecycle";

let installed = false;

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
    if (end) recordUnexpectedEnd(end);
  } catch {
    // ignore
  }

  try {
    installGlobalHandlers();
  } catch {
    // ignore
  }

  try {
    startLifecycleMonitor();
  } catch {
    // ignore
  }
}
