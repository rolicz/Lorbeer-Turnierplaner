const cssVar = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
