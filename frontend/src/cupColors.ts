export const CUP_COLOR_VAR_BY_KEY: Record<string, string> = {
  // Cup key -> CSS variable name (without rgb(...)).
  // A cup's colour is a token of its own (`themes/defaults.css`, darkened in
  // `themes/light.css` so the holder's name stays readable on the light page
  // ground — A6). Don't point a cup at a gradient or a status colour: those move
  // for other reasons, and the cup's colour is its identity.
  default: "--color-cup-gold",
  // New cup -> green (adjust key to your cups.json "key")
  bauernkranz: "--color-cup-green-dark",
};

export function cupColorVarForKey(cupKey: string): string {
  return CUP_COLOR_VAR_BY_KEY[cupKey] ?? "--color-accent";
}

export function rgbFromCssVar(varName: string): string {
  // Theme variables are stored as "r g b" triplets.
  return `rgb(var(${varName}))`;
}
