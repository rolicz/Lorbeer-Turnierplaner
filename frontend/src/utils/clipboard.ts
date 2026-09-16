/**
 * Copy text, on a phone, where the modern API may not be there.
 *
 * `navigator.clipboard` is missing or blocked in exactly the places these copy buttons
 * matter most (an iOS PWA without a secure-context quirk, a locked-down webview), so the
 * hidden-textarea fallback stays. Returns whether anything reached the clipboard, and the
 * caller shows the text for manual selection when it did not.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the selection fallback
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
