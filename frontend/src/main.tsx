import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import App from "./app/App";
import { registerNotificationServiceWorker } from "./push/push";
import { readStored, writeStored } from "./utils/safeStorage";
import { initDiagnostics } from "./diagnostics/install";
import { createAppQueryClient } from "./api/cachePolicy";
import AppCrashBoundary from "./ui/shell/AppCrashBoundary";
// Bundled locally by Vite (CSS + SVGs) — no runtime CDN request for any flag.
import "flag-icons/css/flag-icons.min.css";
import "./styles.css";
import { THEMES } from "./themes";

// Storage is read through `safeStorage`: on this path a throw (blocked site data,
// a locked-down webview) would be a white screen before React ever mounts (A9).
let storedTheme = readStored("theme");
const knownThemes = new Set(THEMES);
if (storedTheme === "ibm") storedTheme = "blue";
const resolvedTheme = storedTheme && knownThemes.has(storedTheme) ? storedTheme : "blue";
document.documentElement.dataset.theme = resolvedTheme;
if (storedTheme !== resolvedTheme) {
  writeStored("theme", resolvedTheme);
}

// Crash recorder first: it has to be listening before anything can throw, and it
// reads (and clears) the previous session's liveness marker on the way in.
initDiagnostics();

void registerNotificationServiceWorker().catch(() => {
  // notification setup is optional
});

// The client, its `gcTime` and the per-domain `staleTime` table all live in
// `api/cachePolicy.ts`, next to the `qk` factory whose key prefixes they are keyed by.
const qc = createAppQueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Outside every provider: a throw in one of them, in the shell or in the
        router is above `RouteErrorBoundary` and would otherwise blank the app. */}
    <AppCrashBoundary>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </AppCrashBoundary>
  </React.StrictMode>
);
