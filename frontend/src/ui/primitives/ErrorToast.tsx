/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from "react";

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
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex max-w-[min(92vw,420px)] flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto card-outer p-2 shadow-xl">
          <div className="card-inner-flat flex items-start gap-2 py-2">
            <i className="fa-solid fa-circle-exclamation mt-0.5 text-[color:rgb(var(--delta-down)/1)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-text-normal">{t.title}</div>
              <div className="mt-0.5 break-anywhere text-xs text-text-muted">{t.message}</div>
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="icon-button inline-flex h-7 w-7 items-center justify-center"
              title="Dismiss"
            >
              <i className="fa-solid fa-xmark text-[11px]" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
