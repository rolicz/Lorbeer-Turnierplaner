import React from "react";

/**
 * The bare layout every auth page shares (L4): the logo and the app's name over one
 * `card`, centred in a `max-w-sm` column on the page ground — no top bar, no tab bar,
 * no sidebar, because there is nobody to navigate yet. The theme is `<html data-theme>`,
 * set in `main.tsx` before React renders, so this screen reads right in every theme
 * without the shell's `ThemeProvider`.
 *
 * `children` go inside the card; `below` is the muted line or two under it ("New here?
 * Register with a code"). The box that touches the screen edge names its own safe-area
 * insets (`pt-safe-t pb-safe-b`, `DESIGN.md` §7 Overlay), since `body` carries only the
 * horizontal ones.
 */
export default function AuthScreen({ children, below }: { children: React.ReactNode; below?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-default px-4 py-10 pt-safe-t pb-safe-b text-text-normal" data-auth-screen>
      <div className="mx-auto flex w-full max-w-sm flex-col pt-10">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src="/icon-512.png" alt="" width={96} height={96} className="h-24 w-24 rounded-2xl" decoding="async" />
          <h1 className="text-xl font-semibold tracking-tight">Lorbeerkranz</h1>
        </div>
        <div className="card">{children}</div>
        {below ? <div className="mt-4 space-y-2 text-center text-sm text-text-muted">{below}</div> : null}
      </div>
    </div>
  );
}
