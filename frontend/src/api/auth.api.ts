import { apiFetch } from "./client";
import type { LoginResponse } from "./types";

export function login(password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function me(token: string): Promise<{ role: string; exp: number }> {
  return apiFetch("/me", { method: "GET", token });
}
