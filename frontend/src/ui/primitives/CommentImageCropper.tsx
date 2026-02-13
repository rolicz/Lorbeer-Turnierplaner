import { useEffect, useRef, useState } from "react";
import Button from "./Button";
import { ErrorToastOnError } from "./ErrorToast";

const ASPECT_W = 4;
const ASPECT_H = 3;
const CROP_FRAC = 0.9;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

type ImgInfo = {
  src: string;
  w: number;
  h: number;
};

export default function CommentImageCropper({
  open,
  title = "Attach image",
  onClose,
  onApply,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onApply: (blob: Blob) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [img, setImg] = useState<ImgInfo | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [off, setOff] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  }>({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [layout, setLayout] = useState<{
    vW: number;
    vH: number;
    cropW: number;
    cropH: number;
    base: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open || !img) {
      setLayout(null);
      return;
    }

    const compute = () => {
      const el = viewportRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vW = Math.max(1, r.width);
      const vH = Math.max(1, r.height);
      const maxW = vW * CROP_FRAC;
      const maxH = vH * CROP_FRAC;

      let cropW = maxW;
      let cropH = (cropW * ASPECT_H) / ASPECT_W;
      if (cropH > maxH) {
        cropH = maxH;
        cropW = (cropH * ASPECT_W) / ASPECT_H;
      }

      const base = Math.max(cropW / img.w, cropH / img.h);
      setLayout({ vW, vH, cropW, cropH, base });
    };

    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [img, open]);

  function clampOffset(next: { x: number; y: number }, z: number) {
    if (!img || !layout) return next;
    const scale = layout.base * z;
    const dispW = img.w * scale;
    const dispH = img.h * scale;
    const maxX = Math.max(0, (dispW - layout.cropW) / 2);
    const maxY = Math.max(0, (dispH - layout.cropH) / 2);
    return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }

  useEffect(() => {
    setOff((cur) => clampOffset(cur, zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, img, open]);

  async function loadFile(f: File) {
    setErr(null);
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.decoding = "async";
    im.src = url;
    await im.decode();
    setImg({ src: url, w: im.naturalWidth || 1, h: im.naturalHeight || 1 });
    setZoom(1);
    setOff({ x: 0, y: 0 });
  }

  async function exportCropped(outW = 1920, outH = 1440): Promise<Blob> {
    if (!img || !layout) throw new Error("No image");
    const scale = layout.base * zoom;
    const dispW = img.w * scale;
    const dispH = img.h * scale;

    const cropLeft = (layout.vW - layout.cropW) / 2;
    const cropTop = (layout.vH - layout.cropH) / 2;
    const imgLeft = layout.vW / 2 + off.x - dispW / 2;
    const imgTop = layout.vH / 2 + off.y - dispH / 2;

    let sx = (cropLeft - imgLeft) / scale;
    let sy = (cropTop - imgTop) / scale;
    let sw = layout.cropW / scale;
    let sh = layout.cropH / scale;
    sx = clamp(sx, 0, Math.max(0, img.w - sw));
    sy = clamp(sy, 0, Math.max(0, img.h - sh));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas context");

    const src = new Image();
    src.decoding = "async";
    src.src = img.src;
    await src.decode();

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, outW, outH);
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/webp", 0.92);
    });
    if (blob) return blob;
    const png = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });
    if (!png) throw new Error("Failed to export image");
    return png;
  }

  if (!open) return null;

  const frameStyle =
    layout == null
      ? undefined
      : ({
          width: `${layout.cropW}px`,
          height: `${layout.cropH}px`,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
        } as const);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-3 sm:p-6">
        <div className="panel w-full max-w-2xl p-3 sm:p-4">
          <ErrorToastOnError error={err} title="Image crop failed" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-normal truncate">{title}</div>
              <div className="mt-0.5 text-[11px] text-text-muted">Crop 4:3 · exported as 1920x1440</div>
            </div>
            <Button variant="ghost" type="button" onClick={onClose} className="h-9 w-9 p-0 inline-flex items-center justify-center" title="Close">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-3 grid gap-3">
            <div
              ref={viewportRef}
              className="panel-subtle relative mx-auto w-full max-w-[760px] aspect-[4/3] overflow-hidden touch-none"
              onPointerDown={(e) => {
                if (!img) return;
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                setDrag({ active: true, startX: e.clientX, startY: e.clientY, baseX: off.x, baseY: off.y });
              }}
              onPointerMove={(e) => {
                if (!drag.active || !img) return;
                const dx = e.clientX - drag.startX;
                const dy = e.clientY - drag.startY;
                setOff(clampOffset({ x: drag.baseX + dx, y: drag.baseY + dy }, zoom));
              }}
              onPointerUp={() => setDrag((d) => ({ ...d, active: false }))}
              onPointerCancel={() => setDrag((d) => ({ ...d, active: false }))}
            >
              {img ? (
                <img
                  src={img.src}
                  alt=""
                  className="absolute left-1/2 top-1/2 select-none pointer-events-none max-w-none max-h-none"
                  style={{
                    width: `${img.w * (layout?.base ?? 1) * zoom}px`,
                    height: `${img.h * (layout?.base ?? 1) * zoom}px`,
                    transform: `translate(-50%, -50%) translate(${off.x}px, ${off.y}px)`,
                    transformOrigin: "center",
                  }}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-sm text-text-muted">Choose a photo…</div>
              )}
              <div className="pointer-events-none absolute rounded-xl ring-2 ring-white/35" style={frameStyle} />
            </div>

            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div>
                <div className="input-label">Zoom</div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                  disabled={!img}
                />
              </div>
              <div className="flex items-end justify-end gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void loadFile(f);
                  }}
                />
                <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()} disabled={busy} title="Choose photo">
                  <i className="fa-solid fa-image md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">Choose</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                onClick={async () => {
                  if (!img || busy) return;
                  setErr(null);
                  setBusy(true);
                  try {
                    const blob = await exportCropped(1920, 1440);
                    await onApply(blob);
                    onClose();
                  } catch (e: any) {
                    setErr(String(e?.message ?? e));
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={!img || busy}
                title="Use image"
              >
                <i className="fa-solid fa-check md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">{busy ? "Applying…" : "Use image"}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
