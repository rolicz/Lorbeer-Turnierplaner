/* eslint-disable react-refresh/only-export-components */
import { CircleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Button from "./Button";

type ToastLevel = "error";

type ToastPayload = {
  id?: number;
  title?: string;
  message: string;
  level?: ToastLevel;
};

type ToastItem = {
  id: number;
  title: string;
  message: string;
  level: ToastLevel;
};

const EVENT_NAME = "app:error-toast";
let seq = 1;
const recentByKey = new Map<string, number>();

function toText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean" || typeof err === "bigint") return String(err);
  if (err instanceof Error) return err.message || "Error";
  return "";
}

export function showErrorToast(message: string, title = "Error") {
  const msg = (message || "").trim();
  if (!msg) return;

  const now = Date.now();
  const key = `${title}::${msg}`;
  const prev = recentByKey.get(key) ?? 0;
  if (now - prev < 1100) return; // dedupe near-simultaneous repeats
  recentByKey.set(key, now);

  const detail: ToastPayload = { id: now + seq++, title, message: msg, level: "error" };
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT_NAME, { detail }));
}

export function ErrorToastOnError({
  error,
  title = "Error",
}: {
  error: unknown;
  title?: string;
}) {
  const msg = useMemo(() => toText(error).trim(), [error]);
  useEffect(() => {
    if (!msg) return;
    showErrorToast(msg, title);
  }, [msg, title]);
  return null;
}

/**
 * The one mount. It floats above the bottom tab bar, and when the keyboard hides that
 * bar (Q2) the toast drops with it and sits on the keyboard's top edge instead of
 * disappearing: an error you cannot see is worse than a filter you cannot reach, so
 * unlike the filter pill this surface never hides.
 */
export function ErrorToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (ev: Event) => {
      const e = ev as CustomEvent<ToastPayload>;
      const d = e.detail;
      if (!d || !d.message) return;
      const item: ToastItem = {
        id: d.id ?? Date.now() + seq++,
        title: d.title || "Error",
        message: d.message,
        level: d.level || "error",
      };
      setItems((prev) => [...prev, item].slice(-4));
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, 4200);
    };
    window.addEventListener(EVENT_NAME, onToast as EventListener);
    return () => window.removeEventListener(EVENT_NAME, onToast as EventListener);
  }, []);

  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-nav-clear right-4 z-[70] flex max-w-[min(92vw,420px)] flex-col gap-2 pr-safe-r lg:bottom-4">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto card p-2 shadow-xl">
          {/* not CardSection: custom py-2 padding and a flex layout. */}
          <div className="inset flex items-start gap-2 py-2">
            <CircleAlert size={14} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-text-normal">{t.title}</div>
              <div className="mt-0.5 break-anywhere text-xs text-text-muted">{t.message}</div>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="inline-flex h-7 w-7 items-center justify-center p-0"
              title="Dismiss"
            >
              <X size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
