/**
 * `localStorage` that cannot take the app down.
 *
 * Reading or writing it *throws* wherever site data is blocked — Safari's
 * "Block all cookies", a locked-down webview, a full quota — and even touching
 * `window.localStorage` can throw before `getItem` is ever called. On the boot
 * path (theme, stored session) that is a white screen rather than a degraded
 * feature, so every accessor here answers "nothing stored" instead of throwing.
 *
 * The nav/scroll layer wraps its own `sessionStorage` access the same way
 * (`navStack.ts`, `lastLocation.ts`).
 */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}
