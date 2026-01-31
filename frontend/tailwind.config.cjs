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
        zinc: {
          50: cssVar("zinc-50"),
          100: cssVar("zinc-100"),
          200: cssVar("zinc-200"),
          300: cssVar("zinc-300"),
          400: cssVar("zinc-400"),
          500: cssVar("zinc-500"),
          600: cssVar("zinc-600"),
          700: cssVar("zinc-700"),
          800: cssVar("zinc-800"),
          900: cssVar("zinc-900"),
          950: cssVar("zinc-950"),
        },
        neutral: {
          900: cssVar("neutral-900"),
          950: cssVar("neutral-950"),
        },
        emerald: {
          100: cssVar("emerald-100"),
          200: cssVar("emerald-200"),
          300: cssVar("emerald-300"),
          400: cssVar("emerald-400"),
          500: cssVar("emerald-500"),
          800: cssVar("emerald-800"),
          900: cssVar("emerald-900"),
        },
        sky: {
          100: cssVar("sky-100"),
          500: cssVar("sky-500"),
          800: cssVar("sky-800"),
          900: cssVar("sky-900"),
        },
        amber: {
          200: cssVar("amber-200"),
          300: cssVar("amber-300"),
          400: cssVar("amber-400"),
          500: cssVar("amber-500"),
        },
        red: {
          200: cssVar("red-200"),
          300: cssVar("red-300"),
          400: cssVar("red-400"),
          500: cssVar("red-500"),
        },
        yellow: {
          400: cssVar("yellow-400"),
        },
        lime: {
          200: cssVar("lime-200"),
          400: cssVar("lime-400"),
        },
        orange: {
          200: cssVar("orange-200"),
          400: cssVar("orange-400"),
        },
        accent: cssVar("accent"),
        "on-accent": cssVar("on-accent"),
      },
    },
  },
  plugins: [],
};
