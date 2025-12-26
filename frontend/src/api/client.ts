const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
  status: number;
  bodyText: string;
  constructor(status: number, statusText: string, bodyText: string) {
    super(`${status} ${statusText}: ${bodyText}`);
    this.status = status;
    this.bodyText = bodyText;
  }
}

export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const headers = new Headers(opts.headers || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, res.statusText, text);
  }
  return (await res.json()) as T;
}
