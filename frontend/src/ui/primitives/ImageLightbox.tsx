import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function ImageLightbox({
  open,
  src,
  onClose,
  footer,
}: {
  open: boolean;
  src: string | null;
  onClose: () => void;
  /** A control that belongs to this picture (K3). Rendered in the safe box at the
      bottom of the scrim; a click inside it never closes the lightbox. */
  footer?: ReactNode;
}) {
  if (!open || !src) return null;
  return <ImageLightboxOpen key={src} src={src} onClose={onClose} footer={footer} />;
}

function ImageLightboxOpen({
  src,
  onClose,
  footer,
}: {
  src: string;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; baseX: number; baseY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; baseScale: number } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setScale((s) => clamp(s * 1.15, 1, 6));
      if (e.key === "-") setScale((s) => clamp(s / 1.15, 1, 6));
      if (e.key === "0") {
        setScale(1);
        setTx(0);
        setTy(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const measure = () => {
      setViewportSize({
        w: Math.max(0, el.clientWidth || 0),
        h: Math.max(0, el.clientHeight || 0),
      });
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const limits = useMemo(() => {
    if (!natural) return { x: 0, y: 0 };
    const vw = viewportSize.w;
    const vh = viewportSize.h;
    if (vw <= 0 || vh <= 0) return { x: 0, y: 0 };
    const base = Math.min(vw / natural.w, vh / natural.h);
    const rw = natural.w * base * scale;
    const rh = natural.h * base * scale;
    return {
      x: Math.max(0, (rw - vw) / 2),
      y: Math.max(0, (rh - vh) / 2),
    };
  }, [natural, scale, viewportSize.w, viewportSize.h]);

  const renderTx = clamp(tx, -limits.x, limits.x);
  const renderTy = clamp(ty, -limits.y, limits.y);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85"
      /* No flow spacing: rendered inside a `.page` column, this `fixed inset-0` box would
         inherit that column's 12px top margin and stop 12px short of the screen. */
      style={{ margin: 0 }}
      onClickCapture={(e) => {
        // The footer's own controls are not a click on the scrim. Capture runs *before*
        // the child's handler, so the child's `stopPropagation` alone cannot save it.
        if ((e.target as Element | null)?.closest?.("[data-lightbox-footer]")) return;
        if (movedRef.current) {
          movedRef.current = false;
          e.stopPropagation();
          return;
        }
        onClose();
      }}
    >
      <div
        ref={viewportRef}
        /* The scrim stays full-bleed black; the pan/zoom box is the safe area, so the
           photo never sits under a notch or the home indicator (Q4). Insets, not padding:
           `clientWidth`/`clientHeight` below must stay the content box or the fit and the
           pan limits drift. `env()` is 0px where there is no inset. */
        className="absolute bottom-safe-b left-safe-l right-safe-r top-safe-t overflow-hidden touch-none"
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
          setScale((s) => clamp(s * factor, 1, 6));
        }}
        onMouseDown={(e) => {
          movedRef.current = false;
          if (scale <= 1) return;
          dragRef.current = { x: e.clientX, y: e.clientY, baseX: renderTx, baseY: renderTy };
        }}
        onMouseMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
          const nx = clamp(d.baseX + dx, -limits.x, limits.x);
          const ny = clamp(d.baseY + dy, -limits.y, limits.y);
          setTx(nx);
          setTy(ny);
        }}
        onMouseUp={() => {
          dragRef.current = null;
        }}
        onMouseLeave={() => {
          dragRef.current = null;
        }}
        onTouchStart={(e) => {
          movedRef.current = false;
          if (e.touches.length === 2) {
            const a = e.touches[0];
            const b = e.touches[1];
            pinchRef.current = {
              dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
              baseScale: scale,
            };
            dragRef.current = null;
            return;
          }
          if (e.touches.length === 1 && scale > 1) {
            const t = e.touches[0];
            dragRef.current = { x: t.clientX, y: t.clientY, baseX: renderTx, baseY: renderTy };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinchRef.current) {
            e.preventDefault();
            movedRef.current = true;
            const a = e.touches[0];
            const b = e.touches[1];
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            const factor = dist / Math.max(1, pinchRef.current.dist);
            setScale(clamp(pinchRef.current.baseScale * factor, 1, 6));
            return;
          }
          if (e.touches.length === 1 && dragRef.current) {
            e.preventDefault();
            const t = e.touches[0];
            const d = dragRef.current;
            const dx = t.clientX - d.x;
            const dy = t.clientY - d.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
            const nx = clamp(d.baseX + dx, -limits.x, limits.x);
            const ny = clamp(d.baseY + dy, -limits.y, limits.y);
            setTx(nx);
            setTy(ny);
          }
        }}
        onTouchEnd={() => {
          if ((pinchRef.current && scale <= 1) || !pinchRef.current) {
            pinchRef.current = null;
          }
          if (scale <= 1) {
            setTx(0);
            setTy(0);
          }
          dragRef.current = null;
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          movedRef.current = true;
          if (scale <= 1.01) setScale(2);
          else {
            setScale(1);
            setTx(0);
            setTy(0);
          }
        }}
      >
        <div className="absolute inset-0 grid place-items-center">
          <img
            src={src}
            alt=""
            className="max-h-full max-w-full select-none"
            style={{
              transform: `translate(${renderTx}px, ${renderTy}px) scale(${scale})`,
              transformOrigin: "center center",
            }}
            onLoad={(e) => {
              const img = e.currentTarget;
              setNatural({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
            }}
            draggable={false}
          />
        </div>
      </div>

      {/* Safe box, not the scrim's edge: a `fixed inset-0` overlay escapes the body's
          inset padding, so it names the insets itself (Q4). The footer overlaps the
          bottom of a picture that fills the height; on a phone the 16:9 banner sits in
          black space and nothing is covered. */}
      {footer ? (
        <div
          data-lightbox-footer
          className="absolute bottom-safe-b left-safe-l right-safe-r z-10 flex justify-center p-3"
          onClick={(e) => e.stopPropagation()}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
