import { useCallback, useState } from "react";
import { ChevronDown, ClipboardCopy, Trash2 } from "lucide-react";

import { cn } from "../cn";
import { copyText } from "../../utils/clipboard";
import { fmtCount } from "../../utils/format";
import Button from "../primitives/Button";
import ConfirmDialog from "../primitives/ConfirmDialog";
import EmptyState from "../primitives/EmptyState";
import {
  SOURCE_LABEL,
  clearCrashLog,
  formatCrashLog,
  formatTimestamp,
  isSyntheticSource,
  readCrashLog,
  type CrashEntry,
} from "../../diagnostics/crashLog";

/**
 * Settings -> Diagnostics: the crash log, readable on a phone.
 *
 * Roli's PWA has no console and the crash he filmed does not reproduce in
 * Chromium, so this list is the only way the evidence gets off the device. Every
 * entry expands to its stack and the navigation trail that led to it, and one
 * button turns the whole log into text he can paste into a message.
 */

/** The danger idiom (`DESIGN.md` §2): a real error is `error`; a death nobody threw is `warn`. */
function toneFor(entry: CrashEntry): string {
  return isSyntheticSource(entry.source)
    ? "border-warn/40 bg-warn/10 text-warn"
    : "border-error/40 bg-error/10 text-error";
}

function crumbDelta(ms: number): string {
  const s = ms / 1000;
  const sign = s > 0 ? "+" : "";
  return `${sign}${s.toFixed(2)}s`;
}

/** "3 times over 2.4s" -- the pair that tells a one-off from a loop. */
function repeatLine(entry: CrashEntry): string {
  const span = (entry.lastTs ?? entry.ts) - entry.ts;
  const times = `${entry.count} times`;
  return span > 0 ? `${times} over ${(span / 1000).toFixed(1)}s` : times;
}

function EntryRow({ entry }: { entry: CrashEntry }) {
  const [open, setOpen] = useState(false);
  const tone = toneFor(entry);

  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
            <span className="tabular-nums">{formatTimestamp(entry.ts)}</span>
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-micro", tone)}>
              {SOURCE_LABEL[entry.source] ?? entry.source}
            </span>
            {entry.count > 1 ? <span className="tabular-nums">{entry.count}x</span> : null}
            {entry.mode && entry.mode !== "production" ? <span>{entry.mode}</span> : null}
          </span>
          <span className="mt-0.5 block truncate text-sm font-medium text-text-normal">{entry.message}</span>
        </span>
        <ChevronDown
          size={16}
          className={cn("mt-1 shrink-0 text-text-muted transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="mt-2 space-y-2">
          <div className={cn("rounded-xl border p-3 text-xs", tone)}>
            {isSyntheticSource(entry.source) ? (
              <p className="mb-1 font-semibold">No error was thrown.</p>
            ) : null}
            <p className="whitespace-pre-wrap break-words">{entry.message}</p>
          </div>

          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-text-muted">
            <dt>Where</dt>
            <dd className="min-w-0 break-words text-text-normal">{entry.url || "unknown"}</dd>
            <dt>Build</dt>
            <dd className="text-text-normal">{entry.mode ?? "unknown"}</dd>
            {entry.count > 1 ? (
              <>
                <dt>Repeats</dt>
                <dd className="text-text-normal tabular-nums">{repeatLine(entry)}</dd>
              </>
            ) : null}
            {entry.suppressed ? (
              <>
                <dt>Folded in</dt>
                <dd className="text-text-normal tabular-nums">{entry.suppressed} other error(s) in the same burst</dd>
              </>
            ) : null}
          </dl>

          {entry.stack ? (
            <div>
              <div className="mb-1 text-xs font-semibold text-text-normal">Stack</div>
              <pre
                data-no-swipe-nav
                className="inset max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-text-muted"
              >
                {entry.stack}
              </pre>
            </div>
          ) : null}

          {entry.componentStack ? (
            <div>
              <div className="mb-1 text-xs font-semibold text-text-normal">Component stack</div>
              <pre
                data-no-swipe-nav
                className="inset max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-text-muted"
              >
                {entry.componentStack}
              </pre>
            </div>
          ) : null}

          <div>
            <div className="mb-1 text-xs font-semibold text-text-normal">
              Navigation trail ({entry.trail.length})
            </div>
            {entry.trail.length ? (
              <div className="inset p-0">
                <div className="list-divided px-3">
                  {entry.trail.map((c, i) => (
                    <div key={`${c.t}-${i}`} className="flex items-baseline gap-2 py-1.5 text-xs">
                      <span className="w-16 shrink-0 text-right font-mono tabular-nums text-text-muted">
                        {crumbDelta(c.t - entry.ts)}
                      </span>
                      <span className="w-16 shrink-0 font-mono text-micro text-text-muted">{c.k}</span>
                      <span className="min-w-0 break-all text-text-normal">{c.u}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-muted">No navigation was recorded before this.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function DiagnosticsSettings() {
  // Read once, on mount: the log is a module-level store, and a snapshot is what
  // the reader wants anyway — the list must not reshuffle while he is copying it.
  const [entries, setEntries] = useState<CrashEntry[]>(() => readCrashLog());
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const onCopy = useCallback(async () => {
    const text = formatCrashLog(entries);
    const ok = await copyText(text);
    setCopied(ok ? "done" : "failed");
    setFallbackText(ok ? null : text);
    window.setTimeout(() => setCopied("idle"), 2500);
  }, [entries]);

  const onClear = useCallback(() => {
    clearCrashLog();
    setEntries([]);
    setFallbackText(null);
    setConfirmClear(false);
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        The last 10 times the app crashed, went blank or ended unexpectedly, kept on this device only. Open one for
        its stack and the navigation that led to it, or copy the lot into a message.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="flex-1 justify-center gap-2"
          onClick={() => void onCopy()}
          disabled={!entries.length}
        >
          <ClipboardCopy size={14} aria-hidden="true" />
          <span>{copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy all"}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="flex-1 justify-center gap-2"
          onClick={() => setConfirmClear(true)}
          disabled={!entries.length}
        >
          <Trash2 size={14} aria-hidden="true" />
          <span>Clear</span>
        </Button>
      </div>

      {fallbackText ? (
        <div className="space-y-1">
          <p className="text-xs text-text-muted">This browser blocked the clipboard. Select the text and copy it.</p>
          <textarea
            data-no-swipe-nav
            readOnly
            value={fallbackText}
            onFocus={(e) => e.currentTarget.select()}
            className="input-field h-40 w-full font-mono text-xs"
          />
        </div>
      ) : null}

      {entries.length ? (
        <div className="list-divided">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing recorded."
          hint="Crashes, unhandled errors, a screen that goes blank and an app that ends without one show up here."
        />
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear the crash log?"
        confirmLabel="Clear log"
        busyLabel="Clearing…"
        onCancel={() => setConfirmClear(false)}
        onConfirm={onClear}
      >
        <p>
          {fmtCount(entries.length, "recorded event", "recorded events")} and their navigation trails are deleted
          from this device. This is the only copy.
        </p>
      </ConfirmDialog>
    </div>
  );
}
