import { useEffect, useRef, useState } from "react";
import { cn } from "../cn";
import { prefersReducedMotion } from "../scroll";

export default function CollapsibleCard({
  title,
  defaultOpen = true,
  right,
  onOpenChange,
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
  children: React.ReactNode | ((open: boolean) => React.ReactNode);
  className?: string;
  variant?: "outer" | "inner" | "none";
  bodyVariant?: "none" | "inner";
  bodyClassName?: string;
  scrollOnOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useRef<HTMLElement | null>(null);
  const prevOpenRef = useRef<boolean>(open);
  const variantCls =
    variant === "outer" ? "card-outer" : variant === "inner" ? "card-inner" : "";
  const pad = variant === "none" ? "px-3 py-2.5" : "";
  const bodyPad = variant === "none" ? "px-3 pb-3" : "";

  const resolvedBodyVariant: "none" | "inner" =
    bodyVariant ?? (variant === "outer" ? "inner" : "none");

  const innerBodyCls =
    resolvedBodyVariant === "inner"
      ? variant === "outer"
        ? // For outer cards: make the body a lighter "inner" surface without double padding.
          // We "bleed" the body to the outer edges, keep the header on the darker surface.
          "bg-bg-card-inner border-t border-border-card-inner/45 -mx-3 -mb-3 rounded-b-2xl p-3"
        : "card-inner"
      : "";

  const bodyTopGap = variant === "outer" && resolvedBodyVariant === "inner" ? "" : "mt-3";

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
          <span className="text-subtle">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className={cn(bodyTopGap, bodyPad)}>
          {resolvedBodyVariant === "inner" ? (
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
