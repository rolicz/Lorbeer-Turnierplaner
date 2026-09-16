import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "eslint.config.js",
      "postcss.config.cjs",
      "tailwind.config.cjs",
      "public/sw.js",
      "vite.config.ts",
      "vitest.config.ts",
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // "error", not "warn": `npm run lint` is `eslint .`, which exits 0 on
      // warnings, so a warning here could never fail a gate — and four context
      // files silenced it anyway, which is how the Fast Refresh blue screen got
      // in (Q10). A React context belongs in `<Name>Context.ts` (no JSX, no
      // component) with its provider in `<Name>Provider.tsx`; if this rule fires
      // on a context module, split it instead of disabling it.
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
    },
  },

  // don’t fight formatter rules (optional if you use prettier)
  {
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
