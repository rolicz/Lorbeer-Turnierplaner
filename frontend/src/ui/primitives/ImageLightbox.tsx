import { useEffect, useMemo, useRef, useState } from "react";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function ImageLightbox({
  open,
  src,
  onClose,
}: {
  open: boolean;
  src: string | null;
  onClose: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; baseX: number; baseY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; baseScale: number } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setScale(1);
    setTx(0);
    setTy(0);
    setNatural(null);
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  const limits = useMemo(() => {
    const vp = viewportRef.current;
    if (!vp || !natural) return { x: 0, y: 0 };
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (vw <= 0 || vh <= 0) return { x: 0, y: 0 };
    const base = Math.min(vw / natural.w, vh / natural.h);
    const rw = natural.w * base * scale;
    const rh = natural.h * base * scale;
    return {
      x: Math.max(0, (rw - vw) / 2),
      y: Math.max(0, (rh - vh) / 2),
    };
  }, [natural, scale, open]);

  useEffect(() => {
    setTx((v) => clamp(v, -limits.x, limits.x));
    setTy((v) => clamp(v, -limits.y, limits.y));
  }, [limits.x, limits.y]);

  if (!open || !src) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85"
      onClickCapture={(e) => {
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
        className="absolute inset-0 overflow-hidden touch-none"
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
          setScale((s) => clamp(s * factor, 1, 6));
        }}
        onMouseDown={(e) => {
          movedRef.current = false;
          if (scale <= 1) return;
          dragRef.current = { x: e.clientX, y: e.clientY, baseX: tx, baseY: ty };
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
            dragRef.current = { x: t.clientX, y: t.clientY, baseX: tx, baseY: ty };
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
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
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
    </div>
  );
}
