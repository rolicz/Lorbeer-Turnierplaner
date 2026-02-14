import { apiFetch } from "./client";
import type { LoginResponse, MeResponse } from "./types";

export function login(username: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function me(token: string): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me", { method: "GET", token });
}
