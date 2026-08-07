import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 8000, host: true },
  build: {
    // flag-icons ships 500+ SVGs; inlining the small ones as data URIs would
    // bloat the render-blocking CSS by ~85 kB gzipped. Emit them as files
    // instead so the browser only fetches the handful of flags actually shown.
    // Everything else keeps Vite's default inlining behaviour.
    assetsInlineLimit: (filePath) => (filePath.includes("flag-icons") ? false : undefined),
  },
});
