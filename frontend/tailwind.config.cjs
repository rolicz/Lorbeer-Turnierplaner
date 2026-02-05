const cssVar = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        status: {
          live: cssVar("status-live"),
          draft: cssVar("status-draft"),
          done: cssVar("status-done"),
        },
        // Semantic colors (mapped to CSS variables in themes)
        primary: cssVar("color-primary"),
        "on-primary": cssVar("color-on-primary"),
        secondary: cssVar("color-secondary"),
        "on-secondary": cssVar("color-on-secondary"),
        background: {
          DEFAULT: cssVar("color-background-default"),
          alt: cssVar("color-background-alt"),
        },
        text: {
          DEFAULT: cssVar("color-text-default"),
          muted: cssVar("color-text-muted"),
        },
        border: cssVar("color-border-color"),

        // Existing semantic colors
        status: {
          live: cssVar("status-live"),
          draft: cssVar("status-draft"),
          done: cssVar("status-done"),
        },
        accent: cssVar("accent"),
        "on-accent": cssVar("on-accent"),
      },
    },
  },
  plugins: [],
};
