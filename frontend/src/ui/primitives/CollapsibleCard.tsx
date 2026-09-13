import { useEffect, useRef, useState } from "react";
import { cn } from "../cn";
import { prefersReducedMotion } from "../scroll";

export default function CollapsibleCard({
  title,
  defaultOpen = true,
  right,
  onOpenChange,
  hideHeader = false,
  children,
  className = "",
  variant = "none",
  bodyVariant,
  bodyClassName = "",
  scrollOnOpen = false,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  hideHeader?: boolean;
  children: React.ReactNode | ((open: boolean) => React.ReactNode);
  className?: string;
  /** Surface level (`DESIGN.md` §3): `card` = level 1, `inset` = level 2. */
  variant?: "card" | "inset" | "none";
  bodyVariant?: "none" | "inset";
  bodyClassName?: string;
  scrollOnOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useRef<HTMLElement | null>(null);
  const prevOpenRef = useRef<boolean>(open);
  const variantCls = variant === "card" ? "card" : variant === "inset" ? "inset" : "";
  const pad = variant === "none" ? "px-3 py-2.5" : "";
  const bodyPad = variant === "none" ? "px-3 pb-3" : "";

  const resolvedBodyVariant: "none" | "inset" =
    bodyVariant ?? (variant === "card" ? "inset" : "none");

  const innerBodyCls =
    resolvedBodyVariant === "inset"
      ? variant === "card"
        ? // On a level-1 card: bleed the body to the card's edges instead of nesting a
          // second rounded box inside it, and keep the header on the card surface.
          "bg-bg-card-inner border-t border-border-card-inner/45 -mx-3 -mb-3 rounded-b-2xl p-3"
        : "inset"
      : "";

  const bodyTopGap = variant === "card" && resolvedBodyVariant === "inset" ? "" : "mt-3";

  useEffect(() => {
    if (!scrollOnOpen) return;
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen || !open) return; // only on false -> true transitions

    const el = sectionRef.current;
    if (!el) return;

    // Use scrollIntoView so scroll-margin-top is respected (navbar offset).
    // Only triggers on expand, never on internal state changes.
    let canceled = false;
    const raf = requestAnimationFrame(() => {
      if (canceled) return;
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      window.setTimeout(() => {
        if (canceled) return;
        try {
          el.scrollIntoView({ behavior: "auto", block: "start" });
        } catch {
          // ignore
        }
      }, 160);
    });
    return () => {
      canceled = true;
      cancelAnimationFrame(raf);
    };
  }, [open, scrollOnOpen]);

  return (
    <section
      ref={sectionRef}
      className={cn(
        variantCls,
        "min-w-0 scroll-mt-[calc(env(safe-area-inset-top,0px)+104px)] sm:scroll-mt-[calc(env(safe-area-inset-top,0px)+120px)]",
        className,
      )}
    >
      {!hideHeader ? (
        <button
          type="button"
          className={cn("flex w-full items-center justify-between gap-3", pad)}
          onClick={() =>
            setOpen((v) => {
              const next = !v;
              onOpenChange?.(next);
              return next;
            })
          }
        >
          <div className="min-w-0 text-left">
            <div className="text-sm font-semibold">{title}</div>
          </div>

          <div className="flex items-center gap-2">
            {right}
            <span className="text-text-muted/80">{open ? "▾" : "▸"}</span>
          </div>
        </button>
      ) : null}

      {open && (
        <div className={cn(hideHeader ? "" : bodyTopGap, bodyPad)}>
          {resolvedBodyVariant === "inset" ? (
            <div className={cn(innerBodyCls, bodyClassName)}>
              {typeof children === "function" ? children(open) : children}
            </div>
          ) : (
            <div className={cn(bodyClassName)}>
              {typeof children === "function" ? children(open) : children}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
