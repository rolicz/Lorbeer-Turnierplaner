import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import App from "./app/App";
import { THEMES } from "./themes";
import "./styles.css";

const storedTheme = localStorage.getItem("theme");
const knownThemes = new Set(THEMES);
if (storedTheme && knownThemes.has(storedTheme)) {
  document.documentElement.dataset.theme = storedTheme;
} else if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
  document.documentElement.dataset.theme = "light";
} else {
  document.documentElement.dataset.theme = "dark";
}

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5000
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
