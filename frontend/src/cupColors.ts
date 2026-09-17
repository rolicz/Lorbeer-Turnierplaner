export const CUP_COLOR_VAR_BY_KEY: Record<string, string> = {
  // Cup key -> CSS variable name (without rgb(...)).
  // A cup's colour is a token of its own (`themes/defaults.css`, darkened in
  // `themes/light.css` so the holder's name stays readable on the light page
  // ground — A6). Don't point a cup at a gradient or a status colour: those move
  // for other reasons, and the cup's colour is its identity.
  //
  // This is the **text** value (the holder's name, >=4.5:1) — see
  // `CUP_MARK_COLOR_VAR_BY_KEY` below for the brighter, non-text value a ring,
  // crown disc or dot uses (C11).
  default: "--color-cup-gold",
  // New cup -> green (adjust key to your cups.json "key")
  bauernkranz: "--color-cup-green-dark",
};

export function cupColorVarForKey(cupKey: string): string {
  return CUP_COLOR_VAR_BY_KEY[cupKey] ?? "--color-accent";
}

/**
 * The **mark** value for a cup (C11): a ring, a crown disc or a dot is a small
 * non-text shape, so it only has to clear the 3:1 non-text floor rather than
 * text's 4.5:1 — which is what let the Lorbeerkranz's light-theme value read as
 * brown rather than gold (`--color-cup-gold` is dark amber `166 74 12`,
 * darkened until *text* cleared 4.5:1). `--color-cup-gold-mark` is the
 * brighter value that still clears 3:1 and reads gold instead; the
 * Bauernkranz has no such conflict and keeps one token for both jobs.
 */
export const CUP_MARK_COLOR_VAR_BY_KEY: Record<string, string> = {
  default: "--color-cup-gold-mark",
  bauernkranz: "--color-cup-green-dark",
};

export function cupMarkColorVarForKey(cupKey: string): string {
  return CUP_MARK_COLOR_VAR_BY_KEY[cupKey] ?? "--color-accent";
}

export function rgbFromCssVar(varName: string): string {
  // Theme variables are stored as "r g b" triplets.
  return `rgb(var(${varName}))`;
}
