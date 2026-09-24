import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev is one origin, like production (L0). The browser only ever talks to vite;
// vite forwards the API and the websockets to the backend, mirroring
// deploy/Caddyfile rule for rule:
//   handle_path /api/*  → prefix stripped   (`/api/health` reaches the backend as `/health`)
//   handle      /ws/*   → passed through    (`/ws/tournaments` stays `/ws/tournaments`)
// `changeOrigin: false` keeps the browser's own `Host`; no `xfwd`, so no
// `X-Forwarded-For` is invented — the backend sees vite's loopback socket as the peer.
// BACKEND_ORIGIN is where the backend listens (the Makefile spells the default).
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8000,
    host: true,
    proxy: {
      "/api/": { target: BACKEND_ORIGIN, changeOrigin: false, rewrite: (p) => p.replace(/^\/api/, "") },
      "/ws/": { target: BACKEND_ORIGIN, ws: true, changeOrigin: false },
    },
  },
  build: {
    // flag-icons ships 500+ SVGs; inlining the small ones as data URIs would
    // bloat the render-blocking CSS by ~85 kB gzipped. Emit them as files
    // instead so the browser only fetches the handful of flags actually shown.
    // Everything else keeps Vite's default inlining behaviour.
    assetsInlineLimit: (filePath) => (filePath.includes("flag-icons") ? false : undefined),
  },
});
