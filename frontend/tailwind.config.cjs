const cssVar = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
