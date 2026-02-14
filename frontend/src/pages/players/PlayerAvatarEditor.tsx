import { useEffect, useRef, useState } from "react";

import Button from "../../ui/primitives/Button";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Request failed";
}

const CROP_FRAC = 0.84; // crop square relative to viewport size

type ImgInfo = {
  src: string;
  w: number;
  h: number;
};

export default function PlayerAvatarEditor({
  open,
  title,
  canEdit,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  title: string;
  canEdit: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void> | void;
  onDelete: (() => Promise<void> | void) | null;
}) {
  const inputLibraryRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [img, setImg] = useState<ImgInfo | null>(null);
  const [zoom, setZoom] = useState<number>(1); // 1..3 (multiplies the base cover scale)
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

  useEffect(() => {
    if (!open) return;
    // Reset per open, but keep existing image if user re-opens quickly.
    setErr(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDrag({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
    }
  }, [open]);

  const [layout, setLayout] = useState<{ v: number; crop: number; base: number } | null>(null);
  useEffect(() => {
    if (!open || !img) {
      setLayout(null);
      return;
    }

    const compute = () => {
      const el = viewportRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const v = Math.max(1, Math.min(r.width, r.height)); // square viewport
      const crop = Math.max(1, v * CROP_FRAC);
      const base = Math.max(crop / img.w, crop / img.h); // cover the crop square
      setLayout({ v, crop, base });
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
    const maxX = Math.max(0, (dispW - layout.crop) / 2);
    const maxY = Math.max(0, (dispH - layout.crop) / 2);
    return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }

  useEffect(() => {
    // When zoom changes, keep offset valid (prevents empty borders).
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

  async function exportCropped(outSize = 512): Promise<Blob> {
    if (!img || !layout) throw new Error("No image");

    const el = viewportRef.current;
    if (!el) throw new Error("No viewport");
    const r = el.getBoundingClientRect();
    const v = Math.max(1, Math.min(r.width, r.height));
    const crop = Math.max(1, v * CROP_FRAC);
    const cropLeft = (v - crop) / 2;
    const cropTop = (v - crop) / 2;

    const scale = layout.base * zoom;
    const dispW = img.w * scale;
    const dispH = img.h * scale;

    // viewport center + offset => image top-left (in viewport px)
    const imgLeft = v / 2 + off.x - dispW / 2;
    const imgTop = v / 2 + off.y - dispH / 2;

    // source rect (in image px) that corresponds to the crop square
    let sx = (cropLeft - imgLeft) / scale;
    let sy = (cropTop - imgTop) / scale;
    const sw = crop / scale;
    const sh = crop / scale;

    sx = clamp(sx, 0, Math.max(0, img.w - sw));
    sy = clamp(sy, 0, Math.max(0, img.h - sh));

    const canvas = document.createElement("canvas");
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas context");

    // Load source image into an <img> for drawImage
    const src = new Image();
    src.decoding = "async";
    src.src = img.src;
    await src.decode();

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, outSize, outSize);
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, outSize, outSize);

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/webp", 0.92);
    });

    if (blob) return blob;

    // Fallback (older Safari)
    const blob2: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });
    if (!blob2) throw new Error("Failed to export image");
    return blob2;
  }

  if (!open) return null;

  const cropFrameStyle =
    layout == null
      ? undefined
      : ({
          width: `${layout.crop}px`,
          height: `${layout.crop}px`,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
        } as const);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Bottom sheet (mobile-first), centered modal on desktop */}
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-3 sm:p-6">
        <div className="panel w-full max-w-lg p-3 sm:p-4">
          <ErrorToastOnError error={err} title="Avatar action failed" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-normal truncate">{title}</div>
              <div className="mt-0.5 text-[11px] text-text-muted">Square crop, stored locally in DB</div>
            </div>
            <Button variant="ghost" type="button" onClick={onClose} className="h-9 w-9 p-0 inline-flex items-center justify-center" title="Close">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-3 grid gap-3">
            <div
              ref={viewportRef}
              className="panel-subtle relative mx-auto w-full max-w-[420px] aspect-square overflow-hidden touch-none"
              onPointerDown={(e) => {
                if (!img) return;
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                setDrag({ active: true, startX: e.clientX, startY: e.clientY, baseX: off.x, baseY: off.y });
              }}
              onPointerMove={(e) => {
                if (!drag.active || !img) return;
                const dx = e.clientX - drag.startX;
                const dy = e.clientY - drag.startY;
                const next = clampOffset({ x: drag.baseX + dx, y: drag.baseY + dy }, zoom);
                setOff(next);
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
                <div className="absolute inset-0 grid place-items-center text-sm text-text-muted">
                  Choose a photo…
                </div>
              )}

              {/* crop overlay (square + outside dim) */}
              <div
                className="pointer-events-none absolute rounded-xl ring-2 ring-white/35"
                style={cropFrameStyle}
              />
              {/* circle guide (final avatar is shown as a circle) */}
              <div
                className="pointer-events-none absolute rounded-full ring-2 ring-white/30"
                style={cropFrameStyle}
              />
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
                  ref={inputLibraryRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void loadFile(f);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => inputLibraryRef.current?.click()}
                  disabled={!canEdit || busy}
                  title="Choose photo"
                >
                  <i className="fa-solid fa-image md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">Choose</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              {onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    void (async () => {
                      if (busy) return;
                      setErr(null);
                      setBusy(true);
                      try {
                        await onDelete();
                        onClose();
                      } catch (e: unknown) {
                        setErr(errorMessage(e));
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                  disabled={!canEdit || busy}
                  title="Delete avatar"
                >
                  <i className="fa-solid fa-trash md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">Delete</span>
                </Button>
              ) : (
                <span />
              )}

              <Button
                type="button"
                onClick={() => {
                  void (async () => {
                    if (!img || busy) return;
                    setErr(null);
                    setBusy(true);
                    try {
                      const blob = await exportCropped(512);
                      await onSave(blob);
                      onClose();
                    } catch (e: unknown) {
                      setErr(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                disabled={!canEdit || busy || !img}
                title="Save"
              >
                <i className="fa-solid fa-floppy-disk md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Save</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
