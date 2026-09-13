/**
 * Scroll a section into view under the sticky header.
 *
 * Two things make this harder than `scrollIntoView`: the mobile top bar floats
 * over the content (so a naive jump hides the target behind it), and a page whose
 * data is already cached renders its later sections *after* the first paint — the
 * first jump then lands short. With `behavior: "auto"` the target position is
 * therefore re-checked for a moment and corrected until it stops moving, unless
 * the user scrolls in the meantime (their scroll always wins).
 */
const SETTLE_MS = 900;
const SETTLE_STEP_MS = 80;

/** Height of whatever sticky chrome overlaps the top of the content, if any. */
function stickyHeaderHeight(): number {
  const header = document.getElementById("app-top-nav");
  if (!header) return 0;
  const style = window.getComputedStyle(header);
  if (style.position !== "sticky" && style.position !== "fixed") return 0;
  if (style.display === "none" || style.visibility === "hidden") return 0;
  return Math.ceil(header.getBoundingClientRect().height);
}

export function scrollToSectionById(
  id: string,
  retries = 0,
  extraOffsetPx = 0,
  behavior: ScrollBehavior = "smooth"
) {
  let tries = 0;
  const maxTries = Math.max(0, retries);

  const targetFor = (el: HTMLElement) =>
    Math.max(
      0,
      window.scrollY + el.getBoundingClientRect().top - stickyHeaderHeight() - 4 - extraOffsetPx
    );

  const run = () => {
    const el = document.getElementById(id);
    if (!el) {
      if (tries >= maxTries) return;
      tries += 1;
      window.setTimeout(run, 60);
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetFor(el), behavior });
      // A smooth scroll animates, so re-measuring would fight it; only the
      // instant jump keeps correcting itself while late content lands.
      if (behavior !== "auto") return;

      const started = Date.now();
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
      };
      window.addEventListener("wheel", cancel, { passive: true, once: true });
      window.addEventListener("touchstart", cancel, { passive: true, once: true });
      window.addEventListener("keydown", cancel, { once: true });

      const settle = () => {
        if (cancelled) return stop();
        const current = document.getElementById(id);
        if (!current) return stop();
        const want = targetFor(current);
        if (Math.abs(window.scrollY - want) > 2) window.scrollTo({ top: want, behavior: "auto" });
        if (Date.now() - started >= SETTLE_MS) return stop();
        window.setTimeout(settle, SETTLE_STEP_MS);
      };
      const stop = () => {
        window.removeEventListener("wheel", cancel);
        window.removeEventListener("touchstart", cancel);
        window.removeEventListener("keydown", cancel);
      };
      window.setTimeout(settle, SETTLE_STEP_MS);
    });
  };

  run();
}
