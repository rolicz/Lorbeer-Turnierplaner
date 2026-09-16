/**
 * The message a blank screen gets instead of nothing.
 *
 * When the detector (`lifecycle`) finds the mount point empty, the app is gone:
 * React is not running, the router is not running, no provider is left to read a
 * theme or a translation out of. So this file uses **none of them**. It is
 * `document.createElement`, `textContent` and inline styles — the CSS variables
 * the document element already carries, each with a literal fallback in case the
 * stylesheet is what failed. Every statement sits inside one `try`: a recorder
 * that can throw while reporting a crash is worse than no recorder.
 *
 * What the reader gets: what happened, that it was written down, a Reload button
 * and a real navigation to Settings → Diagnostics. Nothing here can be reached by
 * React, so a re-render (if the app somehow comes back) simply overwrites it.
 */
const NOTICE_ID = "lk-blank-notice";

/** `rgb(var(--token, fallback))` — the theme when it is there, a sane colour when it is not. */
function token(name: string, fallback: string): string {
  return `rgb(var(--color-${name}, ${fallback}))`;
}

function makeButton(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText = [
    "flex:1 1 0",
    "min-width:8rem",
    "padding:0.625rem 1rem",
    "border-radius:0.75rem",
    "font:inherit",
    "font-weight:600",
    "font-size:0.875rem",
    "cursor:pointer",
    primary
      ? `background:${token("btn-bg", "37 99 235")};color:${token("btn-text", "255 255 255")};border:0`
      : `background:transparent;color:${token("text-normal", "248 250 252")};border:1px solid ${token("border-card-chip", "71 85 105")}`,
  ].join(";");
  button.addEventListener("click", () => {
    try {
      onClick();
    } catch {
      // ignore
    }
  });
  return button;
}

function makeLine(text: string, muted: boolean): HTMLParagraphElement {
  const p = document.createElement("p");
  p.textContent = text;
  p.style.cssText = `margin:0;font-size:0.875rem;line-height:1.45;color:${
    muted ? token("text-muted", "186 198 216") : token("text-normal", "248 250 252")
  }`;
  return p;
}

/**
 * Paint the notice into the empty mount point. Safe to call more than once — the
 * second call finds its own node and does nothing.
 */
export function paintBlankNotice(): void {
  try {
    if (typeof document === "undefined") return;
    if (document.getElementById(NOTICE_ID)) return;
    const host = document.getElementById("root") ?? document.body;
    if (!host) return;

    const wrap = document.createElement("div");
    wrap.id = NOTICE_ID;
    wrap.setAttribute("role", "alert");
    wrap.setAttribute("data-no-swipe-nav", "");
    wrap.style.cssText = [
      `background:${token("bg-default", "11 17 30")}`,
      `color:${token("text-normal", "248 250 252")}`,
      "min-height:100vh",
      "box-sizing:border-box",
      "padding:calc(env(safe-area-inset-top, 0px) + 2.5rem) 1rem 2rem",
      "font-family:system-ui, -apple-system, 'Segoe UI', sans-serif",
    ].join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      "max-width:28rem",
      "margin:0 auto",
      "display:flex",
      "flex-direction:column",
      "gap:0.75rem",
      `background:${token("bg-card-outer", "21 30 48")}`,
      `border:1px solid ${token("border-card-outer", "51 65 85")}`,
      "border-radius:1rem",
      "padding:1rem",
    ].join(";");

    const title = document.createElement("h1");
    title.textContent = "The app stopped drawing";
    title.style.cssText = `margin:0;font-size:1rem;font-weight:600;color:${token("text-normal", "248 250 252")}`;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:0.5rem";
    row.appendChild(
      makeButton("Reload", true, () => {
        window.location.reload();
      }),
    );
    row.appendChild(
      makeButton("Diagnostics", false, () => {
        window.location.assign("/settings?tab=diagnostics");
      }),
    );

    card.appendChild(title);
    card.appendChild(
      makeLine("The screen went blank while the page was still open. Nothing you did is lost.", true),
    );
    card.appendChild(row);
    card.appendChild(
      makeLine("It was written down on this device: Settings → Diagnostics lists it and copies it as text.", true),
    );
    wrap.appendChild(card);
    host.appendChild(wrap);
  } catch {
    // the recorder is never the reason something breaks
  }
}

/** Test seam: remove a painted notice. */
export function removeBlankNotice(): void {
  try {
    document.getElementById(NOTICE_ID)?.remove();
  } catch {
    // ignore
  }
}

export { NOTICE_ID as BLANK_NOTICE_ID };
