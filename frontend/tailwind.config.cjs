const cssVar = (name) => `rgb(var(--${name}) / <alpha-value>)`;

// The mobile bottom tab bar's own height: `min-h-[56px]` of tabs + its `py-1.5`, plus
// the home-indicator strip it pads itself with. Written once, read as two tokens below.
const bottomNavHeight = "calc(4.5rem + env(safe-area-inset-bottom, 0px))";

module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Safe-area insets as named spacing (DESIGN.md §7, Q4). Every *fixed* overlay
      // escapes the `body` padding that handles the left/right notch, so the container
      // that touches a viewport edge names the inset itself — `pt-safe-t`, `pb-safe-b`,
      // `left-safe-l`, `bottom-safe-b`, … On a device without insets `env()` is 0px, so
      // these resolve to 0 and change nothing. Never hand-spell `env(safe-area-inset-*)`
      // in a class again; the token composes into arbitrary values too
      // (`bottom-[calc(4.5rem+theme(spacing.safe-b))]`).
      spacing: {
        "safe-t": "env(safe-area-inset-top, 0px)",
        "safe-r": "env(safe-area-inset-right, 0px)",
        "safe-b": "env(safe-area-inset-bottom, 0px)",
        "safe-l": "env(safe-area-inset-left, 0px)",

        // The bottom tab bar, as two different questions (Q2):
        //   `nav-h`     — how tall the bar is. A constant. Use it to reserve room at the
        //                 end of a scrolling page, where the reservation must not move.
        //   `nav-clear` — how much room you must leave above the screen's bottom edge
        //                 *right now*. It is `nav-h` normally and **0px while the
        //                 on-screen keyboard is up**, because the bar is hidden then
        //                 (`html[data-keyboard-open]`, `ui/shell/keyboardOpen.ts`) and
        //                 the offset would otherwise be a gap over the keyboard. Every
        //                 surface that floats above the bar (`ErrorToast`, `FilterPill`,
        //                 all three composers) uses this one, so they collapse together.
        // The fallback in the var is the fail-safe: with no flag, no stylesheet and no
        // VisualViewport API, `nav-clear` is simply the bar's height, as before.
        "nav-h": bottomNavHeight,
        "nav-clear": `var(--bottom-nav-clearance, ${bottomNavHeight})`,

        // The mobile **top** bar's side boxes (Q13). The bar is a fixed frame: two
        // boxes of this width with the title between them, so the title's centre is
        // the screen's centre on every page and in every state. The number is the
        // widest either side ever needs — the left cluster, menu 40px + 4px + back
        // 40px — and the right box reserves the same, holding one 36px control
        // (bell or connection marker). It is not on the spacing scale because it is
        // the sum of two controls, not a rhythm step; naming it keeps that arithmetic
        // in one place instead of in a class.
        "top-bar-side": "5.25rem",
      },
      maxHeight: {
        // A full-screen-on-mobile sheet must fit the safe box, gutters included: without
        // this a tall dialog (the croppers) grows past the screen and its buttons cannot be
        // reached — worst in landscape, where a phone is ~390px tall. 1.5rem/3rem are the
        // wrapper's own `p-3`/`sm:p-6` gutters, top and bottom.
        sheet: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.5rem)",
        "sheet-sm": "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 3rem)",
      },
      fontFamily: {
        sans: [
          "Inter var",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        // Soft, sleek elevation (subtle on dark, gentle on light).
        card: "0 1px 2px rgb(0 0 0 / 0.06), 0 6px 20px rgb(0 0 0 / 0.10)",
        pop: "0 12px 40px rgb(0 0 0 / 0.28)",
        focus: "0 0 0 2px rgb(var(--color-accent) / 0.35)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-back": "cubic-bezier(0.34, 1.4, 0.64, 1)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "live-ping": {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "70%, 100%": { transform: "scale(2.2)", opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        "live-ping": "live-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
      colors: {
        // Backgrounds
        "bg-default": cssVar("color-bg-default"),
        "bg-card-outer": cssVar("color-bg-card-outer"),
        "bg-card-inner": cssVar("color-bg-card-inner"),
        "bg-card-chip": cssVar("color-bg-card-chip"),

        // Text
        "text-normal": cssVar("color-text-normal"),
        "text-chip": cssVar("color-text-chip"),
        "text-muted": cssVar("color-text-muted"),

        // Borders
        "border-card-outer": cssVar("color-border-card-outer"),
        "border-card-inner": cssVar("color-border-card-inner"),
        "border-card-chip": cssVar("color-border-card-chip"),

        // Table
        "table-row-a": cssVar("color-table-row-a"),
        "table-row-b": cssVar("color-table-row-b"),

        // Button
        "btn-bg": cssVar("color-btn-bg"),
        "btn-text": cssVar("color-btn-text"),

        // Accent
        accent: cssVar("color-accent"),
        "accent-text": cssVar("color-accent-text"),

        // Semantic result colors (DESIGN.md §2): `text-win`, `bg-loss/15`, `text-live`, …
        win: cssVar("color-win"),
        draw: cssVar("color-draw"),
        loss: cssVar("color-loss"),
        live: cssVar("color-live"),

        // Semantic state colors (DESIGN.md §2): `text-error`, `bg-warn/10`, …
        // A message never borrows a result colour.
        error: cssVar("color-error"),
        warn: cssVar("color-warn"),

        // Hover
        "hover-btn-bg": cssVar("color-hover-btn-bg"),
        "hover-nav": cssVar("color-hover-nav"),
        "hover-default": cssVar("color-hover-default"),
        "hover-green": cssVar("color-hover-green"),
        "hover-blue": cssVar("color-hover-blue"),

        // Pills & Statuses
        "status-bg-default": cssVar("color-status-bg-default"),
        "status-text-default": cssVar("color-status-text-default"),
        "status-border-default": cssVar("color-status-border-default"),
        "status-bg-green": cssVar("color-status-bg-green"),
        "status-text-green": cssVar("color-status-text-green"),
        "status-border-green": cssVar("color-status-border-green"),
        "status-bg-blue": cssVar("color-status-bg-blue"),
        "status-text-blue": cssVar("color-status-text-blue"),
        "status-border-blue": cssVar("color-status-border-blue"),
        "status-bar-default": cssVar("color-status-bar-default"),
        "status-bar-green": cssVar("color-status-bar-green"),
        "status-bar-blue": cssVar("color-status-bar-blue"),

        // Gradients (won't be used with cssVar directly, but good for reference)
        "gradient-gold-from": cssVar("color-gradient-gold-from"),
        "gradient-gold-to": cssVar("color-gradient-gold-to"),
        "gradient-silver-from": cssVar("color-gradient-silver-from"),
        "gradient-silver-to": cssVar("color-gradient-silver-to"),
        "gradient-bronze-from": cssVar("color-gradient-bronze-from"),
        "gradient-bronze-to": cssVar("color-gradient-bronze-to"),
      },
    },
  },
  plugins: [],
};
