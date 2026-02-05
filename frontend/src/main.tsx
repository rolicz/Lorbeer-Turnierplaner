import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import App from "./app/App";
import "./styles.css";
import { THEMES } from "./themes";

let storedTheme = localStorage.getItem("theme");
const knownThemes = new Set(THEMES);
if (storedTheme === "ibm") storedTheme = "blue";
const resolvedTheme = storedTheme && knownThemes.has(storedTheme) ? storedTheme : "blue";
document.documentElement.dataset.theme = resolvedTheme;
if (storedTheme !== resolvedTheme) {
  localStorage.setItem("theme", resolvedTheme);
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
